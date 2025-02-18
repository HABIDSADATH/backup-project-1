

const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const AdminWallet = require('../../models/adminWalletTransactionSchema')

const pageerror = async (req,res)=>{
  res.render('admin-error')
}

const loadLogin = (req,res)=>{
  if(req.session.admin){
    return res.redirect('/admin/')
  }
  res.render('admin-login',{message:null})
}

const login = async (req,res)=>{
  try {

    const {email,password} = req.body;
    const admin = await User.findOne({email,isAdmin:true})

    if(admin){
      const passwordMatch = await bcrypt.compare(password,admin.password)

      if(passwordMatch){
        req.session.admin = true;         
        return res.redirect('/admin')
      }else{
        return res.render('admin-login',{message:'Invalid Password'})
      }
    }else{
      return res.render('admin-login',{message:'Invalid Email'})
    }
  } catch (error) {
    console.log("admin login error",error)
    return res.redirect('/pageerror')
    
  }
}


const loadDashboard = async (req, res) => {
  if (req.session.admin) {
    try {
      
      const totalOrders = await Order.countDocuments();
    
      const totalRevenueResult = await Order.aggregate([
        { $unwind: "$orderItems" },
        { $match: { "orderItems.status": "delivered" } },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] }
            }
          }
        }
      ]);

      const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;

      
      const monthlyRevenue = await Order.aggregate([
        {
          $match: {
            status: { $nin: ['cancelled', 'returned'] },
            createdOn: { $gte: new Date(new Date().getFullYear(), 0, 1) }
          }
        },
        {
          $group: {
            _id: { $month: '$createdOn' },
            revenue: { $sum: '$finalAmount' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      
      const topProducts = await Order.aggregate([
        { $unwind: '$orderItems' },
        {
          $group: {
            _id: '$orderItems.product',
            totalQuantity: { $sum: '$orderItems.quantity' },
            totalRevenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } }
          }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: '$productDetails' }
      ]);

      
      const topCategories = await Order.aggregate([
        { $unwind: '$orderItems' },
        {
          $lookup: {
            from: 'products',
            localField: 'orderItems.product',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $lookup: {
            from: 'categories',
            localField: 'product.category',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: '$category' },
        {
          $group: {
            _id: '$category._id',
            categoryName: { $first: '$category.name' },
            totalSales: { $sum: '$orderItems.quantity' },
            totalRevenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } }
          }
        },
        { $sort: { totalSales: -1 } },
        { $limit: 10 }
      ]);

      
      const topBrands = await Order.aggregate([
        { $unwind: '$orderItems' },
        {
          $lookup: {
            from: 'products',
            localField: 'orderItems.product',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: '$product.brand',
            totalSales: { $sum: '$orderItems.quantity' },
            totalRevenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } }
          }
        },
        { $sort: { totalSales: -1 } },
        { $limit: 10 }
      ]);

      res.render('dashboard', {
        totalOrders,
        totalRevenue,
        monthlyRevenue,
        topProducts,
        topCategories,
        topBrands
      });
    } catch (error) {
      console.error('Dashboard Error:', error);
      res.redirect('/pageerror');
    }
  }
};


// const getDashboardData = async (req, res) => {
//   try {
//     const { timeFrame } = req.query; 
//     let startDate;
    
//     switch(timeFrame) {
//       case 'yearly':
//         startDate = new Date(new Date().getFullYear(), 0, 1);
//         break;
//       case 'monthly':
//         startDate = new Date(new Date().setMonth(new Date().getMonth() - 1));
//         break;
//       case 'weekly':
//         startDate = new Date(new Date().setDate(new Date().getDate() - 7));
//         break;
//       default:
//         startDate = new Date(new Date().getFullYear(), 0, 1);
//     }

//     const salesData = await Order.aggregate([
//       {
//         $match: {
//           createdOn: { $gte: startDate },
//           status: { $nin: ['cancelled', 'returned'] }
//         }
//       },
//       {
//         $group: {
//           _id: {
//             $dateToString: { 
//               format: timeFrame === 'yearly' ? '%Y-%m' : '%Y-%m-%d', 
//               date: '$createdOn' 
//             }
//           },
//           revenue: { $sum: '$finalAmount' },
//           orders: { $sum: 1 }
//         }
//       },
//       { $sort: { '_id': 1 } }
//     ]);

//     res.json(salesData);
//   } catch (error) {
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

const getDashboardData = async (req, res) => {
  try {
    const { timeFrame } = req.query;
    let startDate;
    let groupBy;
    let dateFormat;

    // Calculate start date and group format based on timeFrame
    switch (timeFrame) {
      case 'yearly':
        startDate = new Date(new Date().getFullYear() - 4, 0, 1); // Last 5 years
        groupBy = { year: { $year: "$createdOn" } };
        dateFormat = "%Y";
        break;
      case 'monthly':
        startDate = new Date(new Date().setFullYear(new Date().getFullYear() - 1)); // Last 12 months
        groupBy = {
          year: { $year: "$createdOn" },
          month: { $month: "$createdOn" }
        };
        dateFormat = "%Y-%m";
        break;
      case 'weekly':
        startDate = new Date(new Date().setDate(new Date().getDate() - 28)); // Last 4 weeks
        groupBy = {
          year: { $year: "$createdOn" },
          week: { $week: "$createdOn" },
          day: { $dayOfMonth: "$createdOn" },
          month: { $month: "$createdOn" }
        };
        dateFormat = "%Y-%m-%d";
        break;
      case 'daily':
        startDate = new Date(new Date().setDate(new Date().getDate() - 7)); // Last 7 days
        groupBy = {
          year: { $year: "$createdOn" },
          month: { $month: "$createdOn" },
          day: { $dayOfMonth: "$createdOn" }
        };
        dateFormat = "%Y-%m-%d";
        break;
      default:
        startDate = new Date(new Date().getFullYear() - 4, 0, 1);
        groupBy = { year: { $year: "$createdOn" } };
        dateFormat = "%Y";
    }

    // Get actual sales data
    const salesData = await Order.aggregate([
      {
        $match: {
          createdOn: { $gte: startDate },
          status: { $nin: ['cancelled', 'returned'] }
        }
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: "$finalAmount" },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    // Generate all dates in the range with zero values for missing data
    const allDates = [];
    const currentDate = new Date();
    let iterator = new Date(startDate);

    while (iterator <= currentDate) {
      let key;
      switch (timeFrame) {
        case 'yearly':
          key = iterator.getFullYear();
          iterator.setFullYear(iterator.getFullYear() + 1);
          break;
        case 'monthly':
          key = `${iterator.getFullYear()}-${(iterator.getMonth() + 1).toString().padStart(2, '0')}`;
          iterator.setMonth(iterator.getMonth() + 1);
          break;
        case 'weekly':
        case 'daily':
          key = iterator.toISOString().split('T')[0];
          iterator.setDate(iterator.getDate() + 1);
          break;
      }

      // Find matching sales data or use zero
      const matchingData = salesData.find(data => {
        if (timeFrame === 'yearly') return data._id.year === parseInt(key);
        if (timeFrame === 'monthly') {
          return data._id.year === parseInt(key.split('-')[0]) && 
                 data._id.month === parseInt(key.split('-')[1]);
        }
        return data._id.year === iterator.getFullYear() && 
               data._id.month === (iterator.getMonth() + 1) && 
               data._id.day === iterator.getDate();
      });

      allDates.push({
        _id: key,
        revenue: matchingData ? matchingData.revenue : 0,
        orders: matchingData ? matchingData.orders : 0
      });
    }

    res.json(allDates);
  } catch (error) {
    console.error('Error in getDashboardData:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


const logout = async (req,res)=>{
  try {

    delete req.session.admin 
    return res.redirect ('/admin/login')
    
  } catch (error) {
    console.log("unexpected error during logout",error)
    res.redirect('/pageerror')
  }
}



module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
  getDashboardData
}