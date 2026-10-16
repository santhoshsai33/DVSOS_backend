const chatService = require('./chat.service');
const { apiResponse } = require('../../common/utils/apiResponse');

const getChat = async (req, res, next) => {
  try {
    const { id } = req.params;
    const chat = await chatService.getChatByJobCard(id);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Chat history retrieved successfully',
      data: chat
    });
  } catch (error) {
    return next(error);
  }
};

const sendReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.fullName || req.user?.name || 'Service Advisor';

    const result = await chatService.sendAdvisorReply({
      jobCardId: id,
      text,
      userId,
      userName
    });

    return apiResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Message sent to customer successfully',
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await chatService.markChatAsRead(id);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Chat marked as read',
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getChat,
  sendReply,
  markRead
};
