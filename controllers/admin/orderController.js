



const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Wallet = require('../../models/walletSchema')
const Address = require('../../models/addressSchema');
const { getOrCreateWallet,addWalletTransaction,processRefund } = require('../../utils/walletUtils')
const AdminWallet = require('../../models/adminWalletTransactionSchema');
const orderInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const orderData = await Order.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      {
        $lookup: {
          from: "addresses",
          localField: "address",
          foreignField: "_id",
          as: "addressDetails"
        }
      },
      {
        $unwind: {
          path: "$orderItems",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "orderItems.product",
          foreignField: "_id",
          as: "orderItems.productDetails"
        }
      },
      {
        $unwind: {
          path: "$orderItems.productDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: "$_id",
          userId: { $first: "$userId" },
          userDetails: { $first: { $arrayElemAt: ["$userDetails", 0] } },
          addressDetails: { $first: { $arrayElemAt: ["$addressDetails", 0] } },
          orderItems: {
            $push: {
              product: "$orderItems.product",
              productDetails: "$orderItems.productDetails",
              quantity: "$orderItems.quantity",
              price: "$orderItems.price"
            }
          },
          totalPrice: { $first: "$totalPrice" },
          discount: { $first: "$discount" },
          finalAmount: { $first: "$finalAmount" },
          status: { $first: "$status" },
          createdOn: { $first: "$createdOn" },
          orderId: { $first: "$orderId" },
          paymentMethod: { $first: "$paymentMethod" },
          return: { $first: "$return" }
        }
      },
      { $sort: { createdOn: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    const metrics = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$finalAmount' }
        }
      }
    ]);

    res.render("orders", {
      orders: orderData,
      currentPage: page,
      totalPages: totalPages,
      totalOrders: totalOrders,
      metrics: metrics[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 }
    });
  } catch (error) {
    console.log("order controller error", error);
    res.redirect("/admin/pageerror");
  }
};



const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status, productId } = req.body;

    const validTransitions = {
      'pending': ['processing', 'cancelled'],
      'processing': ['shipped', 'cancelled'],
      'shipped': ['delivered'],
      'delivered': ['return_requested'],
      'return_requested': ['returned', 'cancelled']
    };

    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    let item = null;
    if (productId) {
      item = order.orderItems.find(i => i.product.toString() === productId);
      if (!item) {
        return res.status(404).json({ status: false, message: "Product not found in the order" });
      }

      if (!validTransitions[item.status]?.includes(status)) {
        return res.status(400).json({ status: false, message: "Invalid status transition for the item" });
      }

      item.status = status;

      if (status === 'cancelled') {
        item.cancelledAt = new Date();
      }

      if (status === 'returned') {
        item.refundStatus = 'processing';
        item.refundAmount = item.price * item.quantity; 

        const refundAmount = item.refundAmount;
        if (refundAmount > 0) {
          await processRefund(order.userId, refundAmount, order._id);
        }
      }
    } else {
      if (!validTransitions[order.status]?.includes(status)) {
        return res.status(400).json({ status: false, message: "Invalid status transition for the order" });
      }

      await Promise.all(order.orderItems.map(async (item) => {
        if (validTransitions[item.status]?.includes(status)) {
          item.status = status;

          if (status === 'cancelled') {
            item.cancelledAt = new Date();
          }

          if (status === 'returned') {
            item.refundStatus = 'processing';
            item.refundAmount = item.price * item.quantity;

            const refundAmount = item.refundAmount;
            
            if (refundAmount > 0) {
              await processRefund(order.userId, refundAmount, order._id);
            }
          }
        }
      }));
    }

    const itemStatuses = order.orderItems.map(item => item.status);
    if (itemStatuses.every(status => status === 'cancelled')) {
      order.status = 'cancelled';
    } else if (itemStatuses.every(status => status === 'returned')) {
      order.status = 'returned';
    } else if (itemStatuses.every(status => status === 'delivered')) {
      order.status = 'delivered';
    } else if (itemStatuses.some(status => status === 'shipped')) {
      order.status = 'shipped';
    } else if (itemStatuses.some(status => status === 'processing')) {
      order.status = 'processing';
    } else {
      order.status = status;
    }

    if (status === 'shipped' && !productId) {
      order.invoiceDate = new Date();
    }

    if (status === 'delivered') {
      order.deliveryDate = new Date();
      order.returnExpiryDate = new Date(order.deliveryDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days after delivery date
    }

    if (status === 'delivered' && order.paymentMethod === 'cod') {
      const totalAmount = order.finalAmount;
      let adminWallet = await AdminWallet.findOne();
      if (!adminWallet) {
        adminWallet = new AdminWallet();
      }

      const adminTransaction = {
        user: order.userId,
        amount: totalAmount,
        type: 'credit',
        description: `Payment for delivered COD order #${order._id}`,
        orderId: order._id,
        status: 'completed'
      };

      adminWallet.transactions.push(adminTransaction);
      adminWallet.balance += totalAmount;
      await adminWallet.save();
    }

    await order.save();

    res.json({ status: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};




const getFilteredOrders = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    
    let filter = {};
    if (status) filter.status = status;
    if (startDate && endDate) {
      filter.createdOn = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const orderData = await Order.find(filter)
      .populate('userId', 'name email')
      .populate('address')
      .populate({
        path: 'orderItems.product',
        select: 'name productId images'
      })
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalFilteredOrders = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalFilteredOrders / limit);

    res.json({
      status: true,
      orders: orderData,
      currentPage: page,
      totalPages: totalPages,
      totalOrders: totalFilteredOrders
    });
  } catch (error) {
    console.log("filter orders error", error);
    res.status(500).json({ 
      status: false, 
      message: "Internal server error" 
    });
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdOn = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const salesData = await Order.aggregate([
      { $match: { 
        ...dateFilter,
        status: { $nin: ['Cancelled', 'Returned'] }
      }},
      {
        $group: {
          _id: { 
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: "$createdOn" 
            }
          },
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 },
          averageOrderValue: { $avg: '$finalAmount' },
          totalDiscount: { $sum: '$discount' }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.json({
      status: true,
      salesData: salesData
    });
  } catch (error) {
    console.log("sales report error", error);
    res.status(500).json({ 
      status: false, 
      message: "Internal server error" 
    });
  }
};



const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    // Fetch the order
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({
        status: false,
        message: "Order not found"
      });
    }

    // Check order status
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({
        status: false,
        message: "Order cannot be cancelled at this stage"
      });
    }

    let refundAmount = 0;
    let totalGSTRefund = 0;

    const totalProductPrice = order.orderItems.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    for (const item of order.orderItems) {
      // Restore stock
      const product = await Product.findById(item.product);
      if (product) {
        product.quantity += item.quantity;
        await product.save();
      }

      // Calculate refund for each product
      const discountPerProduct = Math.floor((order.discount / totalProductPrice) * (item.price * item.quantity));
      const productRefundAmount = (item.price * item.quantity) - discountPerProduct;

      // Calculate GST for each product
      const gstPerProduct = Math.round(item.price * item.quantity * 0.18); // Assuming 18% GST
      totalGSTRefund += gstPerProduct;
      
      item.status = 'cancelled';
      item.cancellationReason = 'Cancelled by admin';
      item.cancelledAt = new Date();
      item.refundAmount = productRefundAmount + gstPerProduct;
      item.gstRefundAmount = gstPerProduct;

      refundAmount += productRefundAmount + gstPerProduct;
    }

    // Update order details
    order.status = 'cancelled';
    order.totalPrice = 0;
    order.finalAmount = 0;
    order.gstAmount -= totalGSTRefund;
    await order.save();

    // Handle Admin Wallet
    let adminWallet = await AdminWallet.findOne();
    if (!adminWallet) {
      adminWallet = new AdminWallet();
    }

    if (adminWallet.balance < refundAmount) {
      return res.status(400).json({
        status: false,
        message: "Admin wallet balance is insufficient to process the refund"
      });
    }

    // Process Refund to User Wallet
    const wallet = await getOrCreateWallet(order.userId);
    await addWalletTransaction(
      order.userId,
      refundAmount,
      'credit',
      `Refund for cancelled order #${order._id}`,
      order._id
    );

    // Update Admin Wallet
    const adminTransaction = {
      user: order.userId,
      amount: refundAmount,
      type: 'debit',
      description: `Refund for cancelled order #${order._id}`,
      orderId: order._id,
      status: 'completed'
    };

    adminWallet.transactions.push(adminTransaction);
    adminWallet.balance -= refundAmount;
    await adminWallet.save();

    res.json({
      status: true,
      message: "Order cancelled successfully and refund processed"
    });
  } catch (error) {
    console.log("cancel order error", error);
    res.status(500).json({
      status: false,
      message: "Internal server error"
    });
  }
};




const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findOne({ orderId: orderId })
      .populate({
        path: 'orderItems.product',
        select: 'productName productImages price'
      })
      .populate({
        path: 'userId',
        select: 'name email phone'
      });

    if (!order) {
      return res.status(404).render('page-404', { message: 'Order not found' });
    }

    const addressId = order.address;
    const addressData = await Address.findOne(
      { 'address._id': addressId },
      { 'address.$': 1 }
    );

    if (!addressData || !addressData.address || addressData.address.length === 0) {
      return res.status(404).render('page-404', { message: 'Address not found' });
    }

    // Calculate GST
    const gstAmount = Math.round(order.totalPrice - (order.totalPrice / 1.18)); // Assuming totalPrice includes GST

    const orderDetails = {
      ...order._doc,
      userDetails: {
        name: order.userId?.name,
        email: order.userId?.email,
        phone: order.userId?.phone
      },
      addressDetails: {
        name: addressData.address[0].name,
        address: addressData.address[0].landMark,
        city: addressData.address[0].city,
        state: addressData.address[0].state,
        pincode: addressData.address[0].pincode,
        mobile: addressData.address[0].phone
      },
      orderItems: order.orderItems.map(item => ({
        productDetails: {
          productName: item.product?.productName,
          productImages: item.product?.productImages
        },
        price: item.price,
        quantity: item.quantity,
        status: item.status,
        product: item.product._id,
        returnReason: item.returnReason
      })),
      gstAmount: gstAmount 
    }

    res.render('order-details', {
      order: orderDetails,
      title: 'Order Details'
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('page-404', { message: 'Error fetching order details' });
  }
};




const calculateRefundAmount = (order, item) => {
  
  const totalProductPrice = order.orderItems.reduce((sum, orderItem) => {
    return sum + orderItem.price * orderItem.quantity;
  }, 0);

  
  const discountPerProduct = Math.floor(
    (order.discount / totalProductPrice) * (item.price * item.quantity)
  );
  const productRefundAmount = (item.price * item.quantity) - discountPerProduct;

  
  const gstPerProduct = Math.round(item.price * item.quantity * 0.18);

  let refundAmount = productRefundAmount + gstPerProduct;

  return refundAmount;
};

const updateReturnStatus = async (req, res) => {
  try {
    const { orderId, productId, status } = req.body;

    const validTransitions = {
      return_requested: ["processing", "returned", "delivered"],
      processing: ["returned", "delivered"],
      returned: [],
      rejected: [],
    };

    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.json({ status: false, message: "Order not found" });
    }

    const itemIndex = order.orderItems.findIndex(
      (item) => item.product.toString() === productId
    );
    if (itemIndex === -1) {
      return res.json({
        status: false,
        message: "Product not found in order",
      });
    }

    const currentStatus = order.orderItems[itemIndex].status;
    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.json({
        status: false,
        message: `Cannot update return status from '${currentStatus}' to '${status}'. Invalid status transition.`,
      });
    }

    order.orderItems[itemIndex].status = status;

    if (status === "returned") {
      const refundAmount = calculateRefundAmount(
        order,
        order.orderItems[itemIndex]
      );

      order.orderItems[itemIndex].refundStatus = "processing";
      order.orderItems[itemIndex].refundAmount = refundAmount;

      order.finalAmount -= refundAmount;

      const product = await Product.findById(
        order.orderItems[itemIndex].product
      );
      if (product) {
        product.quantity += order.orderItems[itemIndex].quantity;
        await product.save();
      }

      const wallet = await getOrCreateWallet(order.userId);
      await addWalletTransaction(
        order.userId,
        refundAmount,
        "credit",
        `Refund for returned product in order #${order._id}`,
        order._id
      );

      let adminWallet = await AdminWallet.findOne();
      if (!adminWallet) {
        adminWallet = new AdminWallet();
      }

      if (adminWallet.balance < refundAmount) {
        console.error(
          "Admin wallet balance is insufficient to process the refund for order #",
          order._id
        );
        return res.json({
          status: false,
          message:
            "Admin wallet balance is insufficient to process the refund",
        });
      }

      const adminTransaction = {
        user: order.userId,
        amount: refundAmount,
        type: "debit",
        description: `Refund for returned product in order #${order._id}`,
        orderId: order._id,
        status: "completed",
      };

      adminWallet.transactions.push(adminTransaction);
      adminWallet.balance -= refundAmount;
      await adminWallet.save();
    }

    await order.save();

    res.json({
      status: true,
      message: "Return status updated successfully",
    });
  } catch (error) {
    console.log("Update return status error", error);
    res.json({
      status: false,
      message: "An error occurred while updating return status",
    });
  }
};


module.exports = {
  orderInfo,
  updateOrderStatus,
  getFilteredOrders,
  getSalesReport,
  cancelOrder,
  getOrderDetails,
  updateReturnStatus
}