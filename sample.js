



const mongoose = require('mongoose');
const { Schema } = mongoose;
const walletTransactionSchema = new Schema({
  // ... your existing fields ...
  
  // Add these new fields
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',  // References the admin who processed the transaction
    required: false
  },
  adminNote: {
    type: String,
    required: false
  }
});