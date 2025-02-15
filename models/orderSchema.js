const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  orderItems: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      price: {
        type: Number,
        default: 0,
      },
      gstRate: {
        type: Number,
        required: true,
        default: 0.18,
      },
      status: {
        type: String,
        enum: [
          'pending', 
          'processing', 
          'shipped', 
          'delivered', 
          'cancelled', 
          'return_requested', 
          'returned', 
        ],
        default: 'pending',
      },
      returnReason: {
        type: String, 
      },
      cancellationReason: {
        type: String,
        required: function () {
          return this.status === 'cancelled';
        },
      },
      cancelledAt: {
        type: Date,
      },
      refundStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
      },
      refundAmount: {
        type: Number,
        default: 0,
      },
    },
  ],
  totalPrice: {
    type: Number,
    required: true,
  },
  discount: {
    type: Number,
    default: 0,
  },
  finalAmount: {
    type: Number,
    required: true,
  },
  address: {
    type: Schema.Types.ObjectId,
    ref: 'Address',
    required: true,
  },
  invoiceDate: {
    type: Date,
  },
  deliveryDate: {
    type: Date,
  },
  status: {
    type: String,
    required: true,
    enum: [
      'pending', 
      'processing', 
      'shipped', 
      'delivered', 
      'cancelled', 
      'return_requested',
      'returned', 
    ],
    default: 'pending',
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true,
  },
  couponApplied: {
    type: Boolean,
    default: false,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'online'],
    required: true,
  },
  razorpayOrderId: {
    type: String,
  },
  razorpayPaymentId: {
    type: String,
  },
  razorpaySignature: {
    type: String,
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;