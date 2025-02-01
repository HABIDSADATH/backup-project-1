


const User = require('../../models/userSchema')
const Address = require('../../models/addressSchema')
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const env = require('dotenv').config()
const session = require('express-session')
const Order = require('../../models/orderSchema')
const Product = require('../../models/productSchema')
const mongoose = require('mongoose')
const { productDetails } = require('./productController')
const Wallet = require('../../models/walletSchema')



function generateOtp(){
  const digits = '1234567890'
  let otp = ''
  for(var i=0;i<6;i++){
    otp+=digits[Math.floor(Math.random()*10)]
  }
  return otp
}

const sendVerificationEmail = async (email,otp)=>{
  try {
    console.log(email)
    const transporter = nodemailer.createTransport({
      service:'gmail',
      port:587,
      secure:false,
      requireTLS:true,
      auth:{
        user:process.env.NODEMAILER_EMAIL,
        pass:process.env.NODEMAILER_APP_PASSWORD
      }
    })

    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to:email,
      subject:'Your OTP for password reset',
      text:`Your OTP is ${otp}`,
      html:`<b><h4>Your OTP is ${otp}</h4><br></b>`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent:',info.messageId)
    return true
    
  } catch (error) {
    console.error("Error sending email",error)
    return false
  }
}


const securePassword = async (password) => {
  try {

    const passwordHash = await bcrypt.hash(password,10)
    return passwordHash
    
  } catch (error) {
    
  }
}

const getForgotPassPage = async (req,res)=>{
  try {

    res.render('forgot-password')
    
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}

const forgotEmailValid = async (req,res)=>{
  try {
    const userData = User.findById(req.session.user)
    const {email} = req.body
    console.log('des',email)
    const findUser = await User.findOne({email:email})
    if(findUser){
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email,otp)
      if(emailSent){
        req.session.userOtp = otp
        req.session.email = email
        res.render('forgotPass-otp')
        console.log('OTP:',otp)
      }else{
        res.json({success:false,message:"Failed to send OTP, Please try again"})
      }
    }else{
      res.render("forgot-password",{
        message:"User with this email does not exist",
        user:userData
      })
    }
    
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}


const verifyForgotPassOtp = async (req,res)=>{
  try {

    const enteredOtp = req.body.otp
    console.log('entered otp',enteredOtp)
    if(enteredOtp === req.session.userOtp){
      res.json({success:true,redirectUrl:'/reset-password'})
    }else{
      res.json({success:false,message:'OTP not matching'})
    }
    
  } catch (error) {
    res.status(500).json({success:false,message:'An error occured, Please try again'})
  }
}


const getResetPassPage = async (req,res)=>{
  try {

    res.render('reset-password')
    
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}  

const resendotp = async (req,res)=>{
  try {

    const otp = generateOtp()
    req.session.userOtp = otp
    const email = req.session.email
    console.log("Resending otp to email:",email)
    const emailSent = await sendVerificationEmail(email,otp)
    if(emailSent){
      console.log('Resend OTP:',otp)
      res.status(200).json({success:true,message:'Resend otp successfull'})
    }
    
  } catch (error) {
    console.error("Error in resend otp",error)
    res.status(500).json({success:false,message:'internal server error'})
  }
}

const postNewPassword = async (req,res)=>{
  try {

    const {newPass1,newPass2} = req.body
    const email = req.session.email
    if(newPass1 === newPass2){
      const passwordHash = await securePassword(newPass1)
      await User.updateOne(
        {email,email},
        {$set:{password:passwordHash}}
      )
      res.redirect('/login')
    }else{
      res.render('reset-password',{message:'Passwords do not match'})
    }
    
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}



const userProfile = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findById(user);
    const addressData = await Address.findOne({ userId: user });

    // Get wallet data
    const walletData = await Wallet.findOne({ userId: user })
      .populate('transactions.orderId')
      .sort({ 'transactions.createdAt': -1 });

    const ordersData = await Order.aggregate([
      { $match: { 'userId': new mongoose.Types.ObjectId(user) } },
      { $unwind: '$orderItems' },
      {
        $lookup: {
          from: 'products',
          localField: 'orderItems.product',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      { $unwind: '$productDetails' },
      { $sort: { 'createdOn': -1 } }
    ]);

    res.render('profile', {
      user: userData,
      userAddress: addressData,
      orderData: ordersData,
      wallet: walletData || { balance: 0, transactions: [] } 
    });

  } catch (error) {
    console.error('error for user profile', error);
    res.redirect('/pageNotFound');
  }
};


const changeEmail = async (req,res)=>{
  try {
    const userData = await User.findById(req.session.user)
    res.render('change-email',{user:userData})
    
  } catch (error) {
    res.redirect('/pageNOtFound')
  }
}

const changeEmailValid = async (req, res) => {
  try {
    const userData = await User.findById(req.session.user);
    const { email } = req.body; 

    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const otp = generateOtp();
    console.log('New email and OTP are:', email, otp);

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send email. Please try again later.'
      });

    } else {
      req.session.userOtp = otp;
      req.session.newEmail = email;

      res.render('change-email-otp', { user: userData, otp: otp })
      
    }
  } catch (error) {
    console.log('Change email error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
};

const verifyEmailOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp; 
    const userId = req.session.user; 

    if (enteredOtp === req.session.userOtp) {
      const newEmail = req.session.newEmail; 

      await User.findByIdAndUpdate(userId, { email: newEmail });

      req.session.userOtp = null;
      req.session.newEmail = null;

      return res.status(200).json({
        success: true,
        message: 'Email updated successfully',
        redirectUrl: '/userProfile'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }
  } catch (error) {
    console.error('Error in verifyEmailOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
};




const changePassword = async (req,res)=>{
  try {
    const userData = await User.findById(req.session.user)
    res.render('change-password',{user:userData})
    
  } catch (error) {
    console.log('change-password error',error)
    res.redirect('/pageNotFound')
    
  }
}

const changePasswordValid = async (req,res)=>{
  try {
    const userData = await User.findById(req.session.user)
    const {email} = req.body
    const userExist = await User.findOne({email})
    if(userExist){
      const otp = generateOtp()
      const emailSent = await sendVerificationEmail(email,otp)
      if(emailSent){
        req.session.userOtp = otp
        req.session.userData = req.body
        req.session.email = email
        res.render('change-password-otp',{user:userData})
        console.log('OTP:',otp)
      }else{
        res.json({
          success:false,
          message:'failed to send otp, try again'

        })
      }
    }else{
      res.render('change-password',{
        message:'User with this email does not exis',
        user:userData
      })
    }
    
  } catch (error) {
    console.log('error in change password validation',error)
    res.redirect('/pageNotFound')
  }
}

const verifychangePassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    console.log("Entered OTP: ", enteredOtp);

    if (enteredOtp === req.session.userOtp) {
      res.status(200).json({
        status: true,
        redirectUrl: '/reset-password' 
      });
    } else {
      res.status(200).json({
        status: false,
        message: 'OTP mismatch' 
      });
    }
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({
      status: false,
      message: 'An error occurred, please try again later'
    });
  }
};



const addAddress = async (req,res)=>{
  try {
    
    const user =  req.session.user
    const userData = await User.findById(user)
    res.render('add-address',{user:userData})
    
  } catch (error) {

    res.redirect('/pageNotFound')
    console.log('add address page loading error',error)
    
  }
}

const postAddAddress = async (req,res)=>{
  try {

    const user = req.session.user
    const userData = await User.findOne({_id:user})
    const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body

    const userAddress = await Address.findOne({userId:userData._id})
    if(!userAddress){
      const newAddress = new Address({
        userId:userData._id,
        address:[{addressType,name,city,landMark,state,pincode,phone,altPhone}]
      })
      await newAddress.save()
    }else{
      userAddress.address.push({
        addressType,name,city,landMark,state,pincode,phone,altPhone
      })
      await userAddress.save()
    }

    res.redirect('/userProfile')
    
  } catch (error) {

    console.log('error adding address',error)
    res.redirect('/pageNotFound')
    
  }
}

const editAddress = async (req,res)=>{
  try {

     const addressId = req.query.id
     const user = req.session.user
     const userData = await User.findById(user)
     const currAddress = await Address.findOne({
      'address._id': addressId
    });
    

     if(!currAddress){
      console.log('no currAddress')
      return res.redirect('/pageNotFound')
     }

     const addressData = currAddress.address.find((item)=>{
      return item._id.toString() === addressId.toString()
     })

     if(!addressData){
      console.log('no address data')
      return res.redirect('/pageNotFound')
     }

     res.render('edit-address',{address:addressData,user:userData})
    
  } catch (error) {
    console.error('edit address page load error',error)
    res.redirect('/pageNotFound')
    
  }
}


const postEditAddress = async (req,res)=>{
  try {

    const data = req.body
    const addressId = req.query.id
    const user = req.session.user
    const findAddress = await Address.findOne({
      'address._id':addressId
    })

    if(!findAddress){
      res.redirect('/pageNotFound')
    }
  
    await Address.updateOne(
      {'address._id':addressId},
      {$set:{
        'address.$':{
          _id:addressId,
          addressType:data.addressType,
          name:data.name,
          city:data.city,
          landMark:data.landMark,
          state:data.state,
          pincode:data.pincode,
          phone:data.phone,
          altPhone:data.altPhone
        }
      }}
    )
    res.redirect('/userProfile')

  } catch (error) {

    console.error('error in edit address post',error)
    res.redirect('/pageNotFound')
    
  }
}

const deleteAddress = async (req,res)=>{
  try {

    const addressId = req.query.id
    const findAddress = await Address.findOne({'address._id':addressId})
    if(!findAddress){
      return res.status(404).send('address not found')
    }

    await Address.updateOne({
      'address._id':addressId
    },
    {
      $pull:{
        address:{
          _id:addressId
        }
      }
    }
  )

  res.redirect('/userProfile')

    
  } catch (error) {
    console.error('error in delete address',error)
    res.redirect('/pageNotFound')
  }
}

const updateProfile = async (req, res) => {
  console.log('hello update profile')
  try {
      const userId = req.session.user
      console.log('userId:',userId)
      const { name, phone } = req.body
      

      const updatedUser = await User.findByIdAndUpdate(
          userId,
          { name, phone },
          { new: true }
      )

      

      if (!updatedUser) {
          return res.status(200).json({
              success: false,
              message: 'User not found'
          });
      }

      res.json({
          success: true,
          message: 'Profile updated successfully'
      });
  } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({
          success: false,
          message: 'Error updating profile'
      });
  }
}


module.exports = {
  getForgotPassPage,
  forgotEmailValid,
  verifyForgotPassOtp,
  getResetPassPage,
  resendotp,
  postNewPassword,
  userProfile,
  changeEmail,
  changeEmailValid,
  verifyEmailOtp,
  
  changePassword,
  changePasswordValid,
  verifychangePassOtp,
  addAddress,
  postAddAddress,
  editAddress,
  postEditAddress,
  deleteAddress,
  updateProfile
}