const express = require('express');
require('dotenv').config();
const sessions = require('express-session');
const { PORT, ALT_SCHOOL_SECRET } = require('./config/keys');
const logger = require('./config/logger');
const socket = require('socket.io');
const app = express();
const oneDay = 24 * 60 * 60 * 365 * 1000;
const sessionMiddleware = sessions({
  secret: ALT_SCHOOL_SECRET,
  resave: true,
  saveUninitialized: true,
  rolling: true,
  cookie: { secure: true, maxAge: oneDay },
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/shop.html');
  //   res.status(200).json({ status: true });
});

const server = app.listen(PORT, () => {
  logger.info(`Server is now live at port ${PORT}`);
});

const io = socket(server);

// io.use((socket, next) => {
//   sessionMiddleware(socket.request, socket.request.res, next);
// });

// require('./config/socket')(io);
// module.exports = { sessionMiddleware };

const fastFoods = {
  11: 'Fried Chicken',
  12: 'Burger',
  13: 'Pizza',
  14: 'Hot Dog',
  15: 'French Fries',
};

const orderHistory = [];

io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res, next);
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Get the unique identifier for the user's device
  const deviceId = socket.handshake.headers['user-agent'];

  // Check if the user already has an existing session
  if (
    socket.request.session[deviceId] &&
    socket.request.session[deviceId].userName
  ) {
    // If the user already has a session, use the existing user name and current order
    socket.emit(
      'bot-message',
      `Welcome back, ${
        socket.request.session[deviceId].userName
      }! You have a current order of ${socket.request.session[
        deviceId
      ].currentOrder.join(', ')}`
    );
  } else {
    // If the user does not have a session, create a new session for the user's device
    socket.request.session[deviceId] = {
      userName: '',
      currentOrder: [],
      deviceId: deviceId, // store the deviceId in the session object
    };
  }

  // Ask for the user's name if not provided already
  if (!socket.request.session[deviceId].userName) {
    socket.emit('bot-message', "Hello! What's your name?");
  } else {
    socket.emit(
      'bot-message',
      `Welcome back, ${
        socket.request.session[deviceId].userName
      }! You have a current order of ${socket.request.session[
        deviceId
      ].currentOrder.join(', ')}`
    );
  }

  let userName = socket.request.session[deviceId].userName;

  // Listen for incoming bot messages
  socket.on('bot-message', (message) => {
    console.log('Bot message received:', message);
    socket.emit('bot-message', message);
  });

  // Listen for incoming user messages
  socket.on('user-message', (message) => {
    console.log('User message received:', message);

    if (!userName) {
      // Save the user's name and update the welcome message
      userName = message;
      socket.request.session[deviceId].userName = userName;
      socket.emit(
        'bot-message',
        `Welcome to the Fast Food ChatBot, ${userName}!\n1. Place an order\n99. Checkout order\n98. Order history\n97. Current order\n0. Cancel order`
      );
    } else {
      switch (message) {
        case '1':
          // Generate the list of items dynamically
          const itemOptions = Object.keys(fastFoods)
            .map((item) => `${item}. ${fastFoods[item]}`)
            .join('\n');
          socket.emit(
            'bot-message',
            `The menu items are:\n${itemOptions}\nType the item number to add to your order`
          );
          break;
        case '97':
          // Show the user their current order
          if (socket.request.session[deviceId].currentOrder.length > 0) {
            const currentOrder = socket.request.session[
              deviceId
            ].currentOrder.join(', ');
            socket.emit(
              'bot-message',
              `Your current order: ${currentOrder}\n1. Place an order\n99. Checkout order\n98. Order history\n97. Current order\n0. Cancel order`
            );
          } else {
            socket.emit(
              'bot-message',
              `You don't have any items in your current order yet. Type '1' to see the menu.`
            );
          }
          break;
        case '99':
          // Checkout the order
          if (socket.request.session[deviceId].currentOrder.length > 0) {
            const currentOrder = socket.request.session[
              deviceId
            ].currentOrder.join(', ');
            orderHistory.push({
              user: userName,
              order: currentOrder,
              date: new Date(),
            });
            socket.emit(
              'bot-message',
              `Thanks for your order, ${userName}! Your order of ${currentOrder} will be ready shortly.\n1. Place an order\n98. Order history\n0. Cancel order`
            );
            socket.request.session[deviceId].currentOrder = [];
          } else {
            socket.emit(
              'bot-message',
              `You don't have any items in your current order yet. Type '1' to see the menu.`
            );
          }
          break;
        case '98':
          // Show the order history
          if (orderHistory.length > 0) {
            const history = orderHistory
              .map(
                (order) =>
                  `${order.user} ordered ${
                    order.order
                  } on ${order.date.toDateString()}`
              )
              .join('\n');
            socket.emit(
              'bot-message',
              `Here is the order history:\n${history}\n1. Place an order\n98. Order history\n0. Cancel order`
            );
          } else {
            socket.emit(
              'bot-message',
              `There is no order history yet. Type '1' to see the menu.`
            );
          }
          break;
        case '0':
          // Cancel the order
          const currentOrder = socket.request.session[deviceId].currentOrder;
          if (currentOrder.length === 0 && orderHistory.length === 0) {
            socket.emit(
              'bot-message',
              `There is nothing to cancel. Type '1' to see the menu.`
            );
          } else {
            socket.request.session[deviceId].currentOrder = [];
            orderHistory.length = 0;
            socket.emit(
              'bot-message',
              `Your order has been cancelled.\n1. Place a new order\n98. Order history`
            );
          }
          break;
        default:
          // Add the item to the current order
          const itemNumber = parseInt(message);
          if (!isNaN(itemNumber) && fastFoods[itemNumber]) {
            socket.request.session[deviceId].currentOrder.push(
              fastFoods[itemNumber]
            );
            socket.emit(
              'bot-message',
              `You have added ${fastFoods[itemNumber]} to your current order\n Add another order from the menu\n Type '97' to see your current order\n '98' to see order history\n '99' to checkout\n '0' to cancel your order`
            );
          } else {
            socket.emit(
              'bot-message',
              `Invalid input. Type '1' to see the menu.`
            );
          }
          break;
      }
    }
  });
  // Listen for disconnection event
  socket.on('disconnect', () => {
    delete socket.request.session[deviceId];

    console.log('User disconnected:', socket.id);
  });
});
