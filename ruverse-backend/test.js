const io = require('socket.io-client');
const axios = require('axios');

// Replace with your server's URL and port
const socket = io('http://localhost:8080');

socket.on('connect', async () => {
  console.log('Connected to server');

  // Emit a test event
  socket.emit('add_user', 'testuser');

  console.log("test");

  const promise = axios.post('http://localhost:8080/counseling/init', {user_id : "testuser"});

  console.log("hello");

  const response = await(promise);

  console.log(response.data);

  console.log("world");

});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Listen for a response from the server
socket.on('serverResponse', (data) => {
  console.log('Received response from server:', data);
});

// Handle any errors
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Disconnect after 5 seconds (for demonstration purposes)
// setTimeout(() => {
//   socket.disconnect();
//   console.log('Test completed');
// }, 5000);