const Order = require('../../models/orderSchema')
const Cart = require('../../models/cartSchema'); 
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const Coupon = require('../../models/couponSchema')

const env = require("dotenv").config()
const Razorpay = require('razorpay');
const crypto = require('crypto');


const placeOrder = async (req, res) => {
  try {
      const { addressId, paymentMethod, couponCode } = req.body; 
      const finalAmount = parseFloat(req.body.finalAmount);
      const discountAmount = parseFloat(req.body.discountAmount);

      if (!addressId || !paymentMethod) {
          return res.status(400).json({
              success: false,
              message: 'Address and payment method are required.'
          });
      }

      const user = req.session.user;

      const userCart = await Cart.findOne({ userId: user }).populate('items.productId');

      if (!userCart || !userCart.items.length) {
          return res.status(400).json({
              success: false,
              message: 'Cart is empty'
          });
      }

      for (const item of userCart.items) {
          const product = await Product.findById(item.productId._id);
          if (!product || product.quantity < item.quantity) {
              return res.status(400).json({
                  success: false,
                  message: `Insufficient stock for product: ${product.name}`
              });
          }
      }

      const orderItems = userCart.items.map((item) => ({
          product: item.productId._id,
          quantity: item.quantity,
          price: item.price,
      }));

      const totalPrice = userCart.items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
      );

      const newOrder = new Order({
          orderItems,
          totalPrice,
          discount: discountAmount,
          finalAmount,
          address: addressId,
          invoiceDate: new Date(),
          status: 'pending',
          couponApplied: discountAmount > 0,
          userId: user,
          paymentMethod,
      });

      await newOrder.save();

      
      for (const item of userCart.items) {
          await Product.findByIdAndUpdate(item.productId._id, {
              $inc: { quantity: -item.quantity },
          });
      }

      
      await Cart.findOneAndUpdate({ userId: user }, { $set: { items: [] } });

      
      if (couponCode && discountAmount > 0) {
          await Coupon.findOneAndUpdate(
              { couponCode: couponCode }, 
              { $push: { userId: user } }, 
              { new: true } 
          );
      }

      if (paymentMethod === 'online') {
          const razorpayOrder = await razorpay.orders.create({
              amount: finalAmount * 100, 
              currency: 'INR',
              receipt: `receipt_${newOrder._id}`,
          });

          newOrder.razorpayOrderId = razorpayOrder.id;
          await newOrder.save();

          return res.json({
              success: true,
              message: 'Razorpay order created successfully',
              orderId: newOrder._id,
              razorpayOrderId: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency,
              key: process.env.RAZORPAY_KEY_ID,
          });
      }

      return res.json({
          success: true,
          message: 'Order placed successfully',
          orderId: newOrder._id,
      });
  } catch (error) {
      console.error('Error in placeOrder:', error);
      return res.status(500).json({
          success: false,
          message: 'An error occurred while placing the order',
      });
  }
};

const getOrderDetails = async (req, res) => {
  console.log('hello order details');
  try {
    const orderId = req.params.orderId;
    console.log('orderId is ', orderId);
    
    const user = req.session.user;

    const userData = await User.findById(user);
    

    if (!userData) {
      return res.status(404).render('page-404', {
        message: 'User not found'
      });
    }

    
    const order = await Order.findOne({_id:orderId}).populate({
      path: 'orderItems.product',
      select: 'productName productImages price',
    });
    

      
    if (!order) {
      return res.status(404).render('page-404', {
        message: 'Order not found'
      });
    }

    
    const addressId = order.address;
    const addressData = await Address.findOne({ 'address._id': addressId }, { 'address.$': 1 });
    

    if (!addressData || !addressData.address || addressData.address.length === 0) {
      return res.status(404).render('page-404', {
        message: 'Address not found'
      });
    }

    
    res.render('orderDetails', {
      order: order,
      address: addressData.address[0], 
      user: userData,
      title: 'Order Details'
    });

  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('page-404', {
      message: 'Error fetching order details'
    });
  }
};




const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { cancellationReason } = req.body;
    
    
    const orders = await Order.find({ _id: orderId });
    
    if (!orders || orders.length === 0) {
      return res.status(404).json({ 
        status: false, 
        message: "Order not found" 
      });
    }

    
    const nonCancellableOrder = orders.find(order => 
      !['pending', 'processing'].includes(order.status)
    );
    
    if (nonCancellableOrder) {
      return res.status(400).json({
        status: false,
        message: "Order cannot be cancelled at this stage"
      });
    }

    if (!cancellationReason) {
      return res.status(400).json({
        status: false,
        message: "Cancellation reason is required"
      });
    }

    
    let totalRefundAmount = 0;

    for (const order of orders) {
      
      for (const item of order.orderItems) {
        const product = await Product.findOne({ _id: item.product });
        if (product) {
          product.quantity += item.quantity;
          await product.save();
        }
      }

      
      if (order.paymentMethod !== 'cod' && order.isPaid) {
        totalRefundAmount += order.finalAmount;
      }

      
      order.status = 'Cancelled';
      order.cancellation = {
        reason: cancellationReason,
        cancelledAt: new Date()
      };
      await order.save();
    }

    
    if (totalRefundAmount > 0) {
      try {
        const userId = orders[0].userId; 
        const wallet = await getOrCreateWallet(userId);
        await addWalletTransaction(
          userId,
          totalRefundAmount,
          'credit',
          `Refund for cancelled order #${orders[0].orderId}`,
          orders[0]._id
        );
      } catch (walletError) {
        console.error("Wallet transaction error:", walletError);
        
      }
    }

    res.json({
      status: true,
      message: "Order cancelled successfully"
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({ 
      status: false, 
      message: "Internal server error" 
    });
  }
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, 
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})


const createOrder = async (req, res) => {
  const { amount, currency } = req.body;

  try {
      const options = {
          amount: amount * 100, 
          currency: currency || 'INR',
          receipt: `receipt_${Date.now()}`
      };

      const order = await razorpay.orders.create(options);
      res.status(200).json({
          success: true,
          order,
          key: process.env.RAZORPAY_KEY_ID 
      });
  } catch (error) {
      res.status(500).json({ success: false, message: error.message });
  }
};

const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

  if (expectedSignature === razorpay_signature) {
      try {
         
          const order = await Order.findById(orderId);

          if (!order) {
              return res.status(404).json({ success: false, message: 'Order not found' });
          }

          
          order.razorpayPaymentId = razorpay_payment_id;
          order.razorpaySignature = razorpay_signature;
          order.isPaid = true; 
          order.status = 'processing'; 
          await order.save();

          
          res.status(200).json({ success: true, message: 'Payment verified!', orderId: order._id });
      } catch (error) {
          console.error('Error updating order:', error);
          res.status(500).json({ success: false, message: 'Failed to update order', error });
      }
  } else {
      res.status(400).json({ success: false, message: 'Invalid signature!' });
  }
};

const requestReturn = async (req, res) => {
  console.log('hello request return');
  try {
    const orderId = req.params.orderId; 
    const { reason } = req.body; 

    console.log('orderId is ', orderId);
    console.log('reason is ', reason);

    
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required for return.' });
    }

    
    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    console.log('order is ', order);

    
    if (order.status.toLowerCase() !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Return can only be requested for delivered orders.' });
    }

   
    if (order.return.isRequested) {
      return res.status(400).json({ success: false, message: 'Return request already submitted.' });
    }

    order.status = 'Return Request';
    order.return = {
      isRequested: true,
      requestDate: new Date(),
      reason: reason,
      status: 'pending', 
    };


    
    await order.save();

    
    res.status(200).json({ success: true, message: 'Return request submitted successfully.' });
  } catch (error) {
    console.error('Error processing return request:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};




module.exports = {
  placeOrder,
  getOrderDetails,
  cancelOrder,
  createOrder,
  verifyPayment,
  requestReturn,
}