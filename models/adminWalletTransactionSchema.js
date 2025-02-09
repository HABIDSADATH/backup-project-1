const mongoose = require('mongoose');
const { Schema } = mongoose;

const adminWalletTransactionSchema = new Schema({
  transactionId: {
    type: String,
    default: () => require('uuid').v4(),
    unique: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const adminWalletSchema = new Schema({
  balance: {
    type: Number,
    default: 0,
    min: 0  
  },
  transactions: [adminWalletTransactionSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

adminWalletSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

const AdminWallet = mongoose.model('AdminWallet', adminWalletSchema);
module.exports = AdminWallet;