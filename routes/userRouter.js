const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userControllers')
const cartController = require('../controllers/user/cartController')
const checkoutController = require('../controllers/user/checkoutController')
const orderController = require('../controllers/user/orderController')
const passport = require('passport');
const profileController = require('../controllers/user/profileController')
const { userAuth, userLogin } = require('../middlewares/userAuths')
const productController = require('../controllers/user/productController')
const wishlistController = require('../controllers/user/wishlistController')

router.get('/pageNotFound',userController.pageNotFound)

//sign up managemant
router.get('/',userController.loadHomePage)
router.get('/shop',userAuth,userController.loadShopingPage)
router.get('/filter',userAuth,userController.filerProduct)
router.get('/filterPrice',userAuth,userController.filterByPrice)
router.post('/search',userAuth,userController.searchProducts)
router.get('/alphabeticSort', userAuth,userController.alphabeticSort)
router.get('/latestSort',userAuth,userController.latestSort)


// Cart Management 
router.post('/addToCart',userAuth,cartController.addToCart)
router.get('/loadCart',userAuth,cartController.viewCart)
router.delete('/removeFromCart',userAuth,cartController.removeFromCart)
router.put('/updateCartQuantity',userAuth,cartController.updateCartQuantity)



//checkout Management
router.get('/checkout',userAuth,checkoutController.viewCheckout)
router.post('/create-razorpay-order',userAuth,orderController.createOrder);
router.post('/verify-payment',userAuth,orderController.verifyPayment);


//order Management
router.post('/placeOrder',userAuth,orderController.placeOrder)
router.get('/order/:orderId',userAuth,orderController.getOrderDetails)
router.post('/cancel-order/:orderId',userAuth,orderController.cancelOrder)
router.post('/orders/:orderId/return',userAuth,orderController.requestReturn);

router.get('/pageNotFound',userController.pageNotFound)
router.get('/signup',userLogin,userController.loadSignup)

router.post('/signup',userLogin,userController.signup)
router.post('/verify-otp',userController.verifyOtp)
router.post('/resend-otp',userController.resendOTP)


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))

router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),
(req,res)=>{
  req.session.user = req.user._id
  req.session.save((err) =>{
    if(err){
      console.log('session save error',err)
      return res.redirect('/signup')
    }
    res.redirect('/')
  })
  
})

//login management
router.get('/login',userLogin,userController.loadLogin)
router.post('/login',userLogin,userController.login)
router.get('/logout',userAuth,userController.logout)

//profile Management
router.get('/forgot-password',profileController.getForgotPassPage)
router.post('/forgot-email-valid',profileController.forgotEmailValid)
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp)
router.get('/reset-password',profileController.getResetPassPage)
router.post('/resend-forgot-otp',profileController.resendotp)
router.post('/reset-password',profileController.postNewPassword)
router.get('/userProfile',userAuth,profileController.userProfile)
router.get('/change-email',userAuth,profileController.changeEmail)
router.post('/change-email',userAuth,profileController.changeEmailValid)
router.post('/verify-email-otp',userAuth,profileController.verifyEmailOtp)

router.get('/change-password',userAuth,profileController.changePassword)
router.post('/change-password',userAuth,profileController.changePasswordValid)
router.post('/verify-changepassword-otp',userAuth,profileController.verifychangePassOtp)
router.put('/update-profile', userAuth, profileController.updateProfile)

//address management
router.get('/addAddress',userAuth,profileController.addAddress)
router.post('/addAddress',userAuth,profileController.postAddAddress)
router.get('/editAddress',userAuth,profileController.editAddress)
router.post('/editAddress',userAuth,profileController.postEditAddress)
router.get('/deleteAddress',userAuth,profileController.deleteAddress)





//product management
router.get('/productDetails',productController.productDetails)

//wishlist management
router.get('/wishlist',userAuth,wishlistController.loadWishlist)
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist)
router.get('/removeFromWishlist',userAuth,wishlistController.removeProduct)


//coupon management
router.post('/apply-coupon',userAuth,checkoutController.applyCoupon)

module.exports = router;