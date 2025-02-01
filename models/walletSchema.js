




const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
  transactionId: {
    type: String,
    default: () => require('uuid').v4(),
    unique: true
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

const walletSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0  
  },
  isActive: {
    type: Boolean,
    default: true
  },
  transactions: [walletTransactionSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});


walletSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;