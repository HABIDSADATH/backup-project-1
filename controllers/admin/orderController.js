



const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Wallet = require('../../models/walletSchema')
const Address = require('../../models/addressSchema');

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
    const { orderId, status } = req.body;

   
    const validTransitions = {
      'pending': ['processing', 'Cancelled'],
      'processing': ['shipped', 'Cancelled'],
      'shipped': ['Delivered'],
      'Deliverd': ['Return Request'],
      'Return Request': ['Returned', 'Cancelled']
    };

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ 
        status: false, 
        message: "Order not found" 
      });
    }

    
    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status transition"
      });
    }

    
    await Order.updateOne(
      { orderId: orderId },
      { 
        $set: { 
          status: status,
          ...(status === 'shipped' && { invoiceDate: new Date() })
        }
      }
    );

    res.json({ 
      status: true, 
      message: "Order status updated successfully" 
    });
  } catch (error) {
    console.log("update order status error", error);
    res.status(500).json({ 
      status: false, 
      message: "Internal server error" 
    });
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
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ 
        status: false, 
        message: "Order not found" 
      });
    }

   
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({
        status: false,
        message: "Order cannot be cancelled at this stage"
      });
    }

    for (const item of order.orderItems) {
      const product = await Product.findOne({ _id: item.product });
      if (product) {
        product.quantity += item.quantity;
        await product.save();
      }
    }
    
    order.status = 'Cancelled';
    await order.save();

    res.json({
      status: true,
      message: "Order cancelled successfully"
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
                  productImages: item.product?.productImages,
              },
              price: item.price,
              quantity: item.quantity
          }))
      };

      res.render('order-details', {
          order: orderDetails,
          title: 'Order Details'
      });

  } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(500).render('page-404', { message: 'Error fetching order details' });
  }
};


const updateReturnStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    
    
    const validTransitions = {
      'pending': ['approved', 'rejected'],
      'approved': ['completed'],
      'rejected': [], 
      'completed': []  
    };

    const order = await Order.findOne({ orderId: orderId });
    
    if (!order) {
      return res.json({ status: false, message: 'Order not found' });
    }

    if (!order.return || !order.return.isRequested) {
      return res.json({ status: false, message: 'No return request found for this order' });
    }

    
    const currentStatus = order.return.status;

    
    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.json({ 
        status: false, 
        message: `Cannot update return status from '${currentStatus}' to '${status}'. Invalid status transition.`
      });
    }

    
    order.return.status = status;
    if(order.return.status === 'completed') {
      order.status = 'Returned';
    }

    
    
    if (status === 'completed') {
      try {
        
        for (const item of order.orderItems) {
          const product = await Product.findOne({ _id: item.product });
          if (product) {
            product.quantity += item.quantity;
            await product.save();
          }
        }

        
        const wallet = await getOrCreateWallet(order.userId);
        await addWalletTransaction(
          order.userId,
          order.finalAmount,
          'credit',
          `Refund for returned order #${order.orderId}`,
          order._id
        );
      } catch (walletError) {
        console.log("Wallet transaction error:", walletError);
        return res.json({ 
          status: false, 
          message: 'Failed to process refund' 
        });
      }
    }

    await order.save();

    res.json({ 
      status: true, 
      message: 'Return status updated successfully' 
    });
  } catch (error) {
    console.log("Update return status error", error);
    res.json({ 
      status: false, 
      message: 'An error occurred while updating return status' 
    });
  }
};


const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId });
    await wallet.save();
  }
  return wallet;
};

const addWalletTransaction = async (userId, amount, type, description, orderId) => {
  const wallet = await getOrCreateWallet(userId);
  
  const transaction = {
    amount,
    type,
    description,
    orderId,
    status: 'completed'
  };

  if (type === 'credit') {
    wallet.balance += amount;
  } else if (type === 'debit') {
    if (wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }
    wallet.balance -= amount;
  }

  wallet.transactions.push(transaction);
  await wallet.save();
  return wallet;
};

module.exports = {
  orderInfo,
  updateOrderStatus,
  getFilteredOrders,
  getSalesReport,
  cancelOrder,
  getOrderDetails,
  updateReturnStatus
};