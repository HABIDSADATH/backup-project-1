

const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');

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
      // Get basic stats
      const totalOrders = await Order.countDocuments();
      const totalRevenue = await Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'returned'] } } },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } }
      ]);

      // Get monthly revenue data for the chart
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

      // Get top 10 selling products
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

      // Get top categories
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

      // Get top brands
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
        totalRevenue: totalRevenue[0]?.total || 0,
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

// Add filter endpoint for charts
const getDashboardData = async (req, res) => {
  try {
    const { timeFrame } = req.query; // yearly, monthly, weekly
    let startDate;
    
    switch(timeFrame) {
      case 'yearly':
        startDate = new Date(new Date().getFullYear(), 0, 1);
        break;
      case 'monthly':
        startDate = new Date(new Date().setMonth(new Date().getMonth() - 1));
        break;
      case 'weekly':
        startDate = new Date(new Date().setDate(new Date().getDate() - 7));
        break;
      default:
        startDate = new Date(new Date().getFullYear(), 0, 1);
    }

    const salesData = await Order.aggregate([
      {
        $match: {
          createdOn: { $gte: startDate },
          status: { $nin: ['cancelled', 'returned'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: timeFrame === 'yearly' ? '%Y-%m' : '%Y-%m-%d', 
              date: '$createdOn' 
            }
          },
          revenue: { $sum: '$finalAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.json(salesData);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};


const logout = async (req,res)=>{
  try {

    req.session.destroy(err =>{
      if(err){
        console.log("Error destroying session",err)
        return res.redirect('/pageerror')
      }
      res.redirect('/admin/login')
    })
    
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