const prisma = require('../../config/db');
const { getSocket } = require('../../config/socket');
const { sendWhatsAppMessage } = require('../../providers/whatsapp/whatsapp.service');
const env = require('../../config/env');

const CHAT_SCHEMA_SQL = `
IF OBJECT_ID('dbo.job_card_chats', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.job_card_chats (
    id INT IDENTITY(1,1) PRIMARY KEY,
    job_card_id INT NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    customer_mobile NVARCHAR(20) NOT NULL,
    unread_count INT NOT NULL DEFAULT 0,
    last_message_text NVARCHAR(500) NULL,
    last_sender_type NVARCHAR(20) NULL,
    last_message_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    messages_json NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_job_card_chats_job_card_id ON dbo.job_card_chats(job_card_id);
  CREATE INDEX IX_job_card_chats_customer_mobile ON dbo.job_card_chats(customer_mobile);
  CREATE INDEX IX_job_card_chats_unread_count ON dbo.job_card_chats(unread_count);
  CREATE INDEX IX_job_card_chats_last_message_at ON dbo.job_card_chats(last_message_at);
END
`;

let schemaPromise = null;
const ensureChatSchema = async () => {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      try {
        await prisma.$executeRawUnsafe(CHAT_SCHEMA_SQL);
      } catch (err) {
        console.warn('[Chat] Schema ensure notice:', err.message);
      }
    })();
  }
  return schemaPromise;
};

const resolveJobCard = async (identifier) => {
  const rawId = String(identifier || '').trim();
  if (!rawId) return null;

  const parsedId = Number(rawId);
  const isNumeric = Number.isInteger(parsedId) && parsedId > 0;

  const conditions = [
    { slug: rawId },
    { slug: rawId.toLowerCase() },
    { jobCardNo: rawId },
    { jobCardNo: rawId.toUpperCase() }
  ];

  if (isNumeric) {
    conditions.push({ id: parsedId });
  }

  return prisma.jobCard.findFirst({
    where: { OR: conditions },
    include: {
      customer: true,
      vehicle: {
        include: { brand: true }
      }
    }
  });
};

const syncExistingApprovalsToChat = async (jobCard, existingRow, currentMessages) => {
  try {
    const approvals = await prisma.jobCardApproval.findMany({
      where: {
        jobCardId: jobCard.id,
        approvalType: 'ADDITIONAL_WORK'
      },
      include: {
        services: {
          include: {
            serviceItem: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (!approvals || approvals.length === 0) return currentMessages;

    let updated = false;
    let mergedMessages = [...currentMessages];

    for (const approval of approvals) {
      if (!approval.approvalCode) continue;

      const hasRequest = mergedMessages.some(m => m.text && m.text.includes(approval.approvalCode));
      if (!hasRequest) {
        const customerName = jobCard.customer?.fullName || 'Customer';
        const vehicleNo = jobCard.vehicle?.registrationNo || 'your vehicle';
        const serviceLines = (approval.services || []).map((service, index) => {
          const lineTotal = Number(service.price || 0) * Number(service.quantity || 1);
          const serviceName = service.serviceItem?.name || service.serviceName || service.name || 'Service';
          return `${index + 1}. ${serviceName} x${service.quantity || 1} - Rs. ${lineTotal.toLocaleString('en-IN')}`;
        });

        const approvalMessageText = [
          'Additional Work Approval Required 🔧',
          `Hello ${customerName}, your vehicle ${vehicleNo} needs approval for additional work.`,
          '',
          `Job Card: ${jobCard.jobCardNo}`,
          `Approval Code: ${approval.approvalCode}`,
          '',
          'Services Required:',
          ...serviceLines,
          '',
          approval.mechanicExplanation ? `Mechanic Note: ${approval.mechanicExplanation}` : null,
          `Total Amount: Rs. ${Number(approval.totalAmount || 0).toLocaleString('en-IN')}`
        ].filter(Boolean).join('\n');

        const requestMessage = {
          id: `aw-${approval.id}-${approval.approvalCode}`,
          sender: 'ADVISOR',
          senderName: 'Service Advisor',
          text: approvalMessageText,
          mediaUrl: approval.voice_note_url || null,
          time: (approval.sentAt || approval.createdAt || new Date()).toISOString()
        };

        mergedMessages.push(requestMessage);
        updated = true;
      }

      if (approval.customerResponse && approval.respondedAt) {
        const hasResponse = mergedMessages.some(m =>
          m.sender === 'CUSTOMER' &&
          (m.text === approval.customerResponse || (approval.approvalCode && m.text && m.text.includes(approval.approvalCode)))
        );
        if (!hasResponse) {
          const responseMessage = {
            id: `aw-res-${approval.id}`,
            sender: 'CUSTOMER',
            senderName: jobCard.customer?.fullName || 'Customer',
            text: approval.customerResponse,
            time: approval.respondedAt.toISOString()
          };
          mergedMessages.push(responseMessage);
          updated = true;
        }
      }
    }

    if (updated) {
      mergedMessages.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
      const lastMsg = mergedMessages[mergedMessages.length - 1];
      const updatedJson = JSON.stringify(mergedMessages);
      const now = new Date();

      if (existingRow) {
        await prisma.$executeRawUnsafe(
          `UPDATE dbo.job_card_chats
           SET messages_json = @P1,
               last_message_text = @P2,
               last_sender_type = @P3,
               last_message_at = @P4,
               updated_at = @P5
           WHERE job_card_id = @P6`,
          updatedJson,
          String(lastMsg?.text || '').substring(0, 490),
          lastMsg?.sender || 'SYSTEM',
          lastMsg?.time ? new Date(lastMsg.time) : now,
          now,
          jobCard.id
        );
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO dbo.job_card_chats (
             job_card_id, customer_id, customer_mobile, unread_count,
             last_message_text, last_sender_type, last_message_at,
             messages_json, created_at, updated_at
           ) VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10)`,
          jobCard.id,
          jobCard.customerId || 0,
          jobCard.customer?.mobileNo || '',
          0,
          String(lastMsg?.text || '').substring(0, 490),
          lastMsg?.sender || 'SYSTEM',
          lastMsg?.time ? new Date(lastMsg.time) : now,
          updatedJson,
          now,
          now
        );
      }
    }

    return mergedMessages;
  } catch (err) {
    console.warn('[Chat] Failed to sync approvals to chat:', err.message);
    return currentMessages;
  }
};

const getChatByJobCard = async (identifier) => {
  await ensureChatSchema();
  const jobCard = await resolveJobCard(identifier);
  if (!jobCard) {
    const error = new Error('Job Card not found');
    error.statusCode = 404;
    throw error;
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, job_card_id, customer_id, customer_mobile, unread_count, last_message_text, last_sender_type, last_message_at, messages_json
     FROM dbo.job_card_chats WHERE job_card_id = @P1`,
    jobCard.id
  );

  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  let messages = [];
  if (row && row.messages_json) {
    try {
      messages = typeof row.messages_json === 'string' ? JSON.parse(row.messages_json) : row.messages_json;
    } catch {
      messages = [];
    }
  }

  messages = await syncExistingApprovalsToChat(jobCard, row, Array.isArray(messages) ? messages : []);
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

  return {
    jobCardId: jobCard.id,
    jobCardNo: jobCard.jobCardNo,
    slug: jobCard.slug,
    customerId: jobCard.customerId,
    customerName: jobCard.customer?.fullName || 'Customer',
    customerMobile: jobCard.customer?.mobileNo || row?.customer_mobile || '',
    vehicleNo: jobCard.vehicle?.registrationNo || '',
    unreadCount: row?.unread_count || 0,
    lastMessageText: lastMsg ? lastMsg.text : (row?.last_message_text || null),
    lastSenderType: lastMsg ? lastMsg.sender : (row?.last_sender_type || null),
    lastMessageAt: lastMsg?.time ? new Date(lastMsg.time) : (row?.last_message_at || null),
    messages: Array.isArray(messages) ? messages : []
  };
};

const addMessageToChat = async ({
  jobCardId,
  customerId,
  customerMobile,
  senderType,
  senderName,
  text,
  mediaUrl
}) => {
  await ensureChatSchema();

  const cleanText = String(text || '').trim();
  if (!cleanText && !mediaUrl) {
    return null;
  }

  const numericJobCardId = Number(jobCardId);
  const numericCustomerId = Number(customerId || 0);
  const cleanMobile = String(customerMobile || '').trim();

  const newMessage = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    sender: senderType, // 'CUSTOMER' | 'ADVISOR' | 'SYSTEM'
    senderName: senderName || (senderType === 'CUSTOMER' ? 'Customer' : 'Service Advisor'),
    text: cleanText,
    mediaUrl: mediaUrl || null,
    time: new Date().toISOString()
  };

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, messages_json, unread_count FROM dbo.job_card_chats WHERE job_card_id = @P1`,
    numericJobCardId
  );

  let currentMessages = [];
  let existingRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

  if (existingRow && existingRow.messages_json) {
    try {
      currentMessages = typeof existingRow.messages_json === 'string'
        ? JSON.parse(existingRow.messages_json)
        : existingRow.messages_json;
    } catch {
      currentMessages = [];
    }
  }

  currentMessages.push(newMessage);
  const updatedJson = JSON.stringify(currentMessages);
  const isCustomer = senderType === 'CUSTOMER';
  const newUnreadCount = isCustomer ? (Number(existingRow?.unread_count || 0) + 1) : 0;
  const now = new Date();

  if (existingRow) {
    await prisma.$executeRawUnsafe(
      `UPDATE dbo.job_card_chats
       SET messages_json = @P1,
           last_message_text = @P2,
           last_sender_type = @P3,
           last_message_at = @P4,
           unread_count = @P5,
           updated_at = @P6
       WHERE job_card_id = @P7`,
      updatedJson,
      cleanText.substring(0, 490),
      senderType,
      now,
      newUnreadCount,
      now,
      numericJobCardId
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO dbo.job_card_chats (
         job_card_id, customer_id, customer_mobile, unread_count,
         last_message_text, last_sender_type, last_message_at,
         messages_json, created_at, updated_at
       ) VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10)`,
      numericJobCardId,
      numericCustomerId,
      cleanMobile,
      isCustomer ? 1 : 0,
      cleanText.substring(0, 490),
      senderType,
      now,
      updatedJson,
      now,
      now
    );
  }

  // Real-time broadcast via Socket.IO
  const io = getSocket();
  if (io) {
    const payload = {
      jobCardId: numericJobCardId,
      message: newMessage,
      unreadCount: newUnreadCount,
      lastMessageAt: now
    };
    io.to(`chat:job_card_${numericJobCardId}`).emit('chat:new_message', payload);
    io.emit('chat:updated', payload);
  }

  return {
    jobCardId: numericJobCardId,
    message: newMessage,
    unreadCount: newUnreadCount
  };
};

const sendAdvisorReply = async ({ jobCardId, text, userId, userName }) => {
  const jobCard = await resolveJobCard(jobCardId);
  if (!jobCard) {
    const error = new Error('Job Card not found');
    error.statusCode = 404;
    throw error;
  }

  const customerMobile = jobCard.customer?.mobileNo;
  if (!customerMobile) {
    const error = new Error('Customer mobile number is missing for this Job Card');
    error.statusCode = 400;
    throw error;
  }

  const cleanText = String(text || '').trim();
  if (!cleanText) {
    const error = new Error('Message text cannot be empty');
    error.statusCode = 400;
    throw error;
  }

  const isSandbox = (env.twilio.whatsappFrom || '').includes('+14155238886');
  const targetMobile = (isSandbox && env.twilio.testMobile)
    ? env.twilio.testMobile
    : (customerMobile || env.twilio.testMobile || '9952656498');

  // 1. Send to WhatsApp via Twilio (routed to sandbox registered test phone in trial mode)
  await sendWhatsAppMessage({
    to: targetMobile,
    body: cleanText
  });

  // 2. Persist in Chat History with the REAL customer's mobile and details for display
  const result = await addMessageToChat({
    jobCardId: jobCard.id,
    customerId: jobCard.customerId,
    customerMobile: customerMobile,
    senderType: 'ADVISOR',
    senderName: userName || 'Service Advisor',
    text: cleanText
  });

  return result;
};

const markChatAsRead = async (identifier) => {
  await ensureChatSchema();
  const jobCard = await resolveJobCard(identifier);
  if (!jobCard) return { success: false };

  await prisma.$executeRawUnsafe(
    `UPDATE dbo.job_card_chats SET unread_count = 0 WHERE job_card_id = @P1`,
    jobCard.id
  );

  const io = getSocket();
  if (io) {
    io.to(`chat:job_card_${jobCard.id}`).emit('chat:read', { jobCardId: jobCard.id });
    io.emit('chat:unread_cleared', { jobCardId: jobCard.id });
  }

  return { success: true, jobCardId: jobCard.id };
};

const findActiveJobCardByMobile = async (rawMobile) => {
  const digits = String(rawMobile || '').replace(/\D/g, '');
  const mobile10 = digits.length >= 10 ? digits.slice(-10) : digits;

  let jobCard = null;
  if (mobile10) {
    jobCard = await prisma.jobCard.findFirst({
      where: {
        customer: {
          OR: [
            { mobileNo: { contains: mobile10 } },
            { alternateMobileNo: { contains: mobile10 } }
          ]
        }
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: true,
        vehicle: true
      }
    });
  }

  // Sandbox fallback: in trial mode, if incoming message doesn't match an exact customer, route to latest active job card
  if (!jobCard) {
    jobCard = await prisma.jobCard.findFirst({
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: true,
        vehicle: true
      }
    });
  }

  return jobCard;
};

module.exports = {
  ensureChatSchema,
  getChatByJobCard,
  addMessageToChat,
  sendAdvisorReply,
  markChatAsRead,
  findActiveJobCardByMobile
};
