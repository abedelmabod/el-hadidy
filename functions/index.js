const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_EXPO_CHUNK_SIZE = 100;
const RECEIPT_WAIT_MS = 15000;
const DEAD_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
]);

const isExpoPushToken = (token = '') => /^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(String(token).trim());

const chunkArray = (items = [], size = MAX_EXPO_CHUNK_SIZE) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const buildUniqueStudents = (snapshots = []) => {
  const studentsById = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((studentDoc) => {
      studentsById.set(studentDoc.id, { id: studentDoc.id, ...studentDoc.data() });
    });
  });
  return Array.from(studentsById.values());
};

const collectTargetStudentTokens = async (targetYear = '') => {
  const year = String(targetYear || '').trim();
  if (!year) return [];

  const [yearSnapshot, accessYearsSnapshot] = await Promise.all([
    db.collection('students').where('year', '==', year).get(),
    db.collection('students').where('accessYears', 'array-contains', year).get(),
  ]);

  const tokenOwners = new Map();
  buildUniqueStudents([yearSnapshot, accessYearsSnapshot]).forEach((student) => {
    if (student.isBanned || student.notificationPermissionStatus === 'denied') return;

    const tokens = [
      student.expoPushToken,
      ...(Array.isArray(student.expoPushTokens) ? student.expoPushTokens : []),
    ];

    tokens.forEach((rawToken) => {
      const token = String(rawToken || '').trim();
      if (!isExpoPushToken(token)) return;

      const owners = tokenOwners.get(token) || new Set();
      owners.add(student.id);
      tokenOwners.set(token, owners);
    });
  });

  return Array.from(tokenOwners.entries()).map(([token, ownerIds]) => ({
    token,
    ownerIds: Array.from(ownerIds),
  }));
};

const sendExpoMessages = async (messages = []) => {
  const ticketRecords = [];

  for (const messageChunk of chunkArray(messages)) {
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageChunk.map(({ token, ...message }) => message)),
    });

    if (!response.ok) {
      throw new Error(`Expo Push API failed with status ${response.status}`);
    }

    const payload = await response.json();
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    tickets.forEach((ticket, index) => {
      ticketRecords.push({
        ticket,
        token: messageChunk[index]?.token,
        ownerIds: messageChunk[index]?.ownerIds || [],
      });
    });
  }

  return ticketRecords;
};

const fetchExpoReceipts = async (ticketRecords = []) => {
  const receiptIds = ticketRecords
    .map((record) => record.ticket?.id)
    .filter(Boolean);

  if (!receiptIds.length) return [];

  await sleep(RECEIPT_WAIT_MS);

  const receiptRecords = [];
  const recordsByTicketId = new Map(
    ticketRecords
      .filter((record) => record.ticket?.id)
      .map((record) => [record.ticket.id, record])
  );

  for (const idChunk of chunkArray(receiptIds)) {
    const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: idChunk }),
    });

    if (!response.ok) {
      logger.warn('Expo receipt API failed', { status: response.status });
      continue;
    }

    const payload = await response.json();
    Object.entries(payload.data || {}).forEach(([ticketId, receipt]) => {
      const sourceRecord = recordsByTicketId.get(ticketId);
      if (!sourceRecord) return;
      receiptRecords.push({ ...sourceRecord, receipt });
    });
  }

  return receiptRecords;
};

const cleanupDeadTokens = async (deadTokenRecords = []) => {
  const cleanupByStudent = new Map();

  deadTokenRecords.forEach((record) => {
    record.ownerIds.forEach((studentId) => {
      const tokens = cleanupByStudent.get(studentId) || new Set();
      tokens.add(record.token);
      cleanupByStudent.set(studentId, tokens);
    });
  });

  await Promise.all(Array.from(cleanupByStudent.entries()).map(async ([studentId, tokensSet]) => {
    const tokens = Array.from(tokensSet);
    const studentRef = db.collection('students').doc(studentId);
    const studentSnapshot = await studentRef.get();
    if (!studentSnapshot.exists) return;

    const student = studentSnapshot.data() || {};
    const patch = {
      expoPushTokens: FieldValue.arrayRemove(...tokens),
      notificationCleanupAt: FieldValue.serverTimestamp(),
    };

    if (tokens.includes(student.expoPushToken)) {
      patch.expoPushToken = FieldValue.delete();
    }

    await studentRef.update(patch);
  }));
};

const publishNewLessonNotification = async (event, sourceCollection) => {
  const lesson = event.data?.data() || {};
  const lessonId = event.params.lessonId || event.params.lectureId || event.data?.id || '';
  const year = String(lesson.year || lesson.accessYear || '').trim();
  const title = String(lesson.title || lesson.name || 'محاضرة جديدة').trim();

  if (!year || lesson.isActive === false) {
    logger.info('Skipping notification for inactive or unscoped lesson', { lessonId, sourceCollection, year });
    return;
  }

  const tokenTargets = await collectTargetStudentTokens(year);
  if (!tokenTargets.length) {
    logger.info('No push tokens found for lesson target', { lessonId, year });
    return;
  }

  const messages = tokenTargets.map(({ token, ownerIds }) => ({
    token,
    ownerIds,
    to: token,
    sound: 'default',
    title: 'محاضرة جديدة',
    body: `تم رفع فيديو: ${title}`,
    priority: 'high',
    channelId: 'default',
    data: {
      type: 'new_lesson',
      lessonId,
      lectureId: lessonId,
      sourceCollection,
      lessonTitle: title,
      year,
      accessYear: year,
      subjectId: lesson.subjectId || '',
      subjectName: lesson.subject || lesson.subjectName || '',
      chapterId: lesson.chapterId || '',
      chapterName: lesson.chapterName || '',
      videoUrl: lesson.url || '',
      pdfUrl: lesson.pdfUrl || '',
    },
  }));

  const tickets = await sendExpoMessages(messages);
  const deadFromTickets = tickets.filter((record) =>
    record.ticket?.status === 'error'
    && DEAD_TOKEN_ERRORS.has(record.ticket?.details?.error)
  );

  const receipts = await fetchExpoReceipts(tickets);
  const deadFromReceipts = receipts.filter((record) =>
    record.receipt?.status === 'error'
    && DEAD_TOKEN_ERRORS.has(record.receipt?.details?.error)
  );

  await cleanupDeadTokens([...deadFromTickets, ...deadFromReceipts]);

  logger.info('New lesson push notification processed', {
    lessonId,
    sourceCollection,
    year,
    sent: messages.length,
    ticketErrors: tickets.filter((record) => record.ticket?.status === 'error').length,
    receiptErrors: receipts.filter((record) => record.receipt?.status === 'error').length,
    cleanedTokens: new Set([...deadFromTickets, ...deadFromReceipts].map((record) => record.token)).size,
  });
};

exports.notifyStudentsOnNewLesson = onDocumentCreated(
  {
    document: 'lessons/{lessonId}',
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  (event) => publishNewLessonNotification(event, 'lessons')
);

exports.notifyStudentsOnNewLecture = onDocumentCreated(
  {
    document: 'lectures/{lectureId}',
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  (event) => publishNewLessonNotification(event, 'lectures')
);
