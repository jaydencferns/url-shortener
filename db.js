const mongoose = require('mongoose');

async function connectDB(uri) {
  if (mongoose.connection.readyState === 1) {
    // Already connected
    return;
  }
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
}

async function disconnectDB() {
  await mongoose.disconnect();
  console.log('❌ Disconnected from MongoDB');
}

module.exports = { connectDB, disconnectDB };
