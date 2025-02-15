const Order = require('../../models/orderSchema')
const Cart = require('../../models/cartSchema'); 
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const Coupon = require('../../models/couponSchema')
const { getOrCreateWallet, addWalletTransaction } = require('../../utils/walletUtils') 
const env = require("dotenv").config()
const Razorpay = require('razorpay');
const crypto = require('crypto')
const PDFDocument = require('pdfkit');
const path = require('path')
const AdminWallet = require('../../models/adminWalletTransactionSchema');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, 
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

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
          message: `Insufficient stock for product: ${product?.productName || 'Unknown Product'}`
        });
      }
    }

    const coupon = await Coupon.findOne({ couponCode });
    if (couponCode && discountAmount > 0) {
      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired coupon'
        });
      } else {
        coupon.userId.push(user);
        await coupon.save();
      }

      const cartTotal = userCart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      if (cartTotal < coupon.minimumPrice) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minimumPrice} required for this coupon`
        });
      }
    }

    const orderItems = userCart.items.map(item => ({
      product: item.productId._id,
      quantity: item.quantity,
      price: item.price
    }));

    const totalPrice = userCart.items.reduce((total, item) => total + (item.price * item.quantity), 0);

    const newOrder = new Order({
      userId: user,
      orderItems,
      totalPrice,
      discount: discountAmount || 0,
      finalAmount,
      address: addressId,
      paymentMethod,
      couponCode: couponCode || null,
      couponApplied: discountAmount > 0,
      invoiceDate: new Date(),
      status: 'pending',
      orderDate: new Date()
    });

    await newOrder.save();

    if (paymentMethod === 'online') {
      const razorpayOrder = await razorpay.orders.create({
        amount: finalAmount * 100,
        currency: 'INR',
        receipt: `receipt_${newOrder._id}`,
        notes: {
          orderId: newOrder._id.toString()
        }
      });

      newOrder.razorpayOrderId = razorpayOrder.id;
      await newOrder.save();

      
      await Cart.findOneAndUpdate(
        { userId: user },
        { $set: { items: [] } }
      );

      return res.json({
        success: true,
        message: 'Razorpay order created successfully',
        orderId: newOrder._id,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      });
    } else {
      for (const item of userCart.items) {
        await Product.findByIdAndUpdate(
          item.productId._id,
          { $inc: { quantity: -item.quantity } }
        );
      }

      
      await Cart.findOneAndUpdate(
        { userId: user },
        { $set: { items: [] } }
      );

      if (couponCode && discountAmount > 0) {
        await Coupon.findOneAndUpdate(
          { couponCode },
          { $push: { userId: user } }
        );
      }

      if (paymentMethod !== 'cod') {
        let adminWallet = await AdminWallet.findOne();
        if (!adminWallet) {
          adminWallet = new AdminWallet();
        }

        const transaction = {
          user: user,
          amount: finalAmount,
          type: 'credit',
          description: `Order placed: ${newOrder._id}`,
          orderId: newOrder._id,
          status: 'completed'
        };

        adminWallet.transactions.push(transaction);
        adminWallet.balance += finalAmount;
        await adminWallet.save();
      }

      return res.json({
        success: true,
        message: 'Order placed successfully',
        orderId: newOrder._id
      });
    }
  } catch (error) {
    console.error('Error in placeOrder:', error)
    return res.status(500).json({
      success: false,
      message: 'An error occurred while placing the order'
    });
  }
}



const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
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
    const { productId, reason: cancellationReason } = req.body;

    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!cancellationReason) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    const productToCancel = order.orderItems.find(
      (item) => item.product.toString() === productId
    );

    if (!productToCancel) {
      return res.status(404).json({
        success: false,
        message: "Product not found in the order",
      });
    }

    if (productToCancel.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Product is already cancelled",
      });
    }

    // Restore product stock
    const product = await Product.findById(productToCancel.product);
    if (product) {
      product.quantity += productToCancel.quantity;
      await product.save();
    }

    // Calculate refund amount
    const totalProductPrice = order.orderItems.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    const discountPerProduct = Math.floor((order.discount / totalProductPrice) * (productToCancel.price * productToCancel.quantity));
    const productRefundAmount = (productToCancel.price * productToCancel.quantity) - discountPerProduct;

    // Calculate GST for the cancelled product
    const gstPerProduct = Math.round(productToCancel.price * productToCancel.quantity * 0.18);

    let refundAmount = productRefundAmount + gstPerProduct;

    // Refund shipping charge if this is the last product in the order
    const remainingProducts = order.orderItems.filter(item => item.status !== "cancelled");
    if (remainingProducts.length === 1 && remainingProducts[0].product.toString() === productId) {
      refundAmount += order.shippingCost || 0; // Add shipping charge to refund
    }

    // Process refund to user wallet
    if (order.paymentMethod !== "cod" && order.isPaid && refundAmount > 0) {
      try {
        const userId = order.userId;
        const wallet = await getOrCreateWallet(userId);
        await addWalletTransaction(
          userId,
          refundAmount,
          "credit",
          `Refund for cancelled product in order #${order._id}`,
          order._id
        );

        let adminWallet = await AdminWallet.findOne();
        if (!adminWallet) {
          adminWallet = new AdminWallet();
        }

        if (adminWallet.balance < refundAmount) {
          return res.status(400).json({
            success: false,
            message: "Admin wallet balance is insufficient to process the refund",
          });
        }

        const transaction = {
          user: userId,
          amount: refundAmount,
          type: 'debit',
          description: `Refund for cancelled product in order #${order._id}`,
          orderId: order._id,
          status: 'completed'
        };

        adminWallet.transactions.push(transaction);
        adminWallet.balance -= refundAmount;
        await adminWallet.save();

      } catch (walletError) {
        console.error("Wallet transaction error:", walletError);
        return res.status(500).json({
          success: false,
          message: "Error processing wallet transaction",
        });
      }
    }

    // Update order and product status
    productToCancel.status = "cancelled";
    productToCancel.cancellationReason = cancellationReason;
    productToCancel.cancelledAt = new Date();
    productToCancel.refundStatus = refundAmount > 0 ? "pending" : "completed";
    productToCancel.refundAmount = refundAmount;

    // Update order totals
    const cancelledProductTotal = productToCancel.price * productToCancel.quantity;
    order.totalPrice -= cancelledProductTotal;
    order.finalAmount -= refundAmount;

    // Deduct GST for the cancelled product
    order.gstAmount -= gstPerProduct;

    // Check if all products are cancelled
    const allProductsCancelled = order.orderItems.every(
      (item) => item.status === "cancelled"
    );

    if (allProductsCancelled) {
      order.status = "cancelled";
      order.finalAmount = 0;
    }

    await order.save();

    res.json({
      success: true,
      message:
        refundAmount > 0
          ? "Product cancelled and refund processed to wallet"
          : "Product cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};





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
          order.status = 'pending'; 
          await order.save();

          for (const item of order.orderItems) {
            await Product.findByIdAndUpdate(
              item.product,
              { $inc: { quantity: -item.quantity } }
            );
          }

          
          let adminWallet = await AdminWallet.findOne();
          if (!adminWallet) {
              adminWallet = new AdminWallet();
          }

          
          const transaction = {
              user: order.userId,
              amount: order.finalAmount,
              type: 'credit',
              description: `Order placed: ${order._id}`,
              orderId: order._id,
              status: 'completed'
          };

          adminWallet.transactions.push(transaction);
          adminWallet.balance += order.finalAmount;
          await adminWallet.save();

          res.status(200).json({ success: true, message: 'Payment verified and logged!', orderId: order._id });
      } catch (error) {
          console.error('Error updating order:', error);
          res.status(500).json({ success: false, message: 'Failed to update order', error });
      }
  } else {
      res.status(400).json({ success: false, message: 'Invalid signature!' });
  }
}



const requestReturn = async (req, res) => {
  try {
    const orderId = req.params.orderId; 
    const { productId, reason } = req.body; 
    console.log('body', req.body)

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required for return.' });
    }

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Return can only be requested for delivered orders.' });
    }

    const currentDate = new Date();
    if (currentDate > order.returnExpiryDate) {
      return res.status(400).json({ success: false, message: 'Return period has expired.' });
    }

    const itemToReturn = order.orderItems.find(item => item.product.toString() === productId.toString());

    if (!itemToReturn) {
      return res.status(404).json({ success: false, message: 'Product not found in this order.' });
    }

    if (itemToReturn.status === 'return_requested') {
      return res.status(400).json({ success: false, message: 'Return request already submitted for this item.' });
    }

    itemToReturn.status = 'return_requested';
    itemToReturn.returnReason = reason; 

    await order.save();

    res.status(200).json({ success: true, message: 'Return request submitted successfully.' });
  } catch (error) {
    console.error('Error processing return request:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};



const renderThankYouPage = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const user = req.session.user;

    const userData = await User.findById(user);
    if (!userData) {
      return res.status(404).render('page-404', {
        message: 'User  not found'
      });
    }

    const order = await Order.findOne({ _id: orderId }).populate({
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

    
    const gstAmount = Math.round(order.totalPrice - (order.totalPrice / 1.18)); 

    res.render('thankyou', {
      order: order,
      address: addressData.address[0], 
      user: userData,
      gstAmount: gstAmount, 
      title: 'Thank You for Your Order'
    });

  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('page-404', {
      message: 'Error fetching order details'
    });
  }
};


const generateOrderInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findOne({ orderId: orderId }).populate({
      path: 'orderItems.product',
      select: 'productName productImages price',
    });

    const addressData = await Address.findOne({ 'address._id': order.address }, { 'address.$': 1 });
    const userData = await User.findById(order.userId);

    if (!order || !addressData || !addressData.address || !userData) {
      return res.status(404).send('Order, Address, or User not found');
    }

    // Calculate GST
    const gstAmount = Math.round(order.totalPrice - (order.totalPrice / 1.18)); // Assuming totalPrice includes GST

    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50 
    });

    let filename = `invoice_${orderId}.pdf`;
    filename = encodeURIComponent(filename);

    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    const tableTop = 350;
    const itemCodeX = 50;
    const statusX = 200;
    const quantityX = 300;
    const priceX = 380;
    const amountX = 480;

    const logoPath = path.join(__dirname, '../../public/images/logo.png');
    doc.image(logoPath, 50, 45, { width: 150 })
       .font('Helvetica-Bold')
       .fontSize(20)
       .fontSize(10)
       .font('Helvetica')
       .text('1234 Main Street', 200, 65, { align: 'right' })
       .text('Calicut, Kerala, 673638', 200, 80, { align: 'right' })
       .text('Phone: +91 7736675660', 200, 95, { align: 'right' })
       .text('Email: famms@gmail.com', 200, 110, { align: 'right' });

    doc.moveTo(50, 140)
       .lineTo(550, 140)
       .stroke();

    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('INVOICE', 50, 170);

    doc.fontSize(10)
       .font('Helvetica')
       .text('Invoice Date:', 50, 200)
       .text(order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : new Date().toLocaleDateString(), 150, 200)
       .text('Order ID:', 50, 215)
       .text(orderId, 150, 215)
       .text('Payment Method:', 50, 230)
       .text(order.paymentMethod.toUpperCase(), 150, 230)
       .text('Payment Status:', 50, 245)
       .text(order.isPaid ? 'PAID' : 'PENDING', 150, 245);

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Bill To:', 50, 275)
       .font('Helvetica')
       .fontSize(10)
       .text(userData.name, 50, 290)
       .text(`${addressData.address[0].city}, ${addressData.address[0].landMark}`, 50, 305)
       .text(`${addressData.address[0].state} - ${addressData.address[0].pincode}`, 50, 320);

    doc.fillColor('#444444')
       .rect(50, tableTop - 20, 500, 20)
       .fill()
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('Item', itemCodeX, tableTop - 15)
       .text('Status', statusX, tableTop - 15)
       .text('Qty', quantityX, tableTop - 15)
       .text('Price', priceX, tableTop - 15)
       .text('Amount', amountX, tableTop - 15);

    doc.fillColor('#000000');

    let position = tableTop + 10;
    order.orderItems.forEach(item => {
      const formattedStatus = item.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const itemPrice = parseInt(item.price);
      const totalPrice = parseInt(item.price) * parseInt(item.quantity);

      doc.font('Helvetica')
         .fontSize(10)
         .text(item.product.productName.substring(0, 25), itemCodeX, position)
         .text(formattedStatus, statusX, position)
         .text(item.quantity.toString(), quantityX, position)
         .text(`₹ ${itemPrice}`, priceX, position)
         .text(`₹ ${totalPrice}`, amountX, position);
      
      doc.moveTo(50, position + 15)
         .lineTo(550, position + 15)
         .strokeColor('#cccccc')
         .stroke();
      
      position += 20;
    });

    doc.moveTo(50, position + 10)
       .lineTo(550, position + 10)
       .strokeColor('#000000')
       .stroke();

    const summaryPosition = position + 30;
    doc.font('Helvetica-Bold')
       .fontSize(10)
       .text('Summary', 350, summaryPosition);

    const deliveryCharges = 49;
    const subtotal = parseInt(order.totalPrice);
    const discount = parseInt(order.discount);
    const finalAmount = parseInt(order.finalAmount);

    doc.font('Helvetica')
       .text('Subtotal:', 350, summaryPosition + 20)
       .text(`₹ ${subtotal}`, amountX, summaryPosition + 20);

    // Add GST to the summary
    doc.text('GST (18%):', 350, summaryPosition + 35)
       .text(`₹ ${gstAmount}`, amountX, summaryPosition + 35);

    if (discount > 0) {
      doc.text('Discount:', 350, summaryPosition + 50)
         .text(`- ₹ ${discount}`, amountX, summaryPosition + 50);
    }

    doc.text('Delivery Charges:', 350, summaryPosition + (discount > 0 ? 65 : 50))
       .text(`₹ ${deliveryCharges}`, amountX, summaryPosition + (discount > 0 ? 65 : 50))
       .font('Helvetica-Bold')
       .text('Final Amount:', 350, summaryPosition + (discount > 0 ? 90 : 75))
       .text(`₹ ${finalAmount}`, amountX, summaryPosition + (discount > 0 ? 90 : 75));

    doc.fontSize(10)
       .font('Helvetica')
       .text('Thank you for your business!', 50, 700, { align: 'center' })
       .text('For any queries, please contact our customer support.', 50, 715, { align: 'center' });

    doc.moveTo(50, 690)
       .lineTo(550, 690)
       .stroke();

    doc.end();

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).send('Error generating invoice');
  }
};



module.exports = {
  placeOrder,
  getOrderDetails,
  cancelOrder,
  createOrder,
  verifyPayment,
  requestReturn,
  renderThankYouPage,
  generateOrderInvoice,
  
}