




const Cart = require('../../models/cartSchema')
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const User = require('../../models/userSchema')
const Coupon = require('../../models/couponSchema')




const viewCheckout = async (req, res) => {
  try {
    const user = req.session.user
    const userData = await User.findById(user)

    const cart = await Cart.findOne({ userId: user }).populate('items.productId')
    if (!cart || cart.items.length === 0) {
      return res.render('cart', { cartItems: [], user: userData, message: 'Your cart is empty' })
    }

    const cartItems = cart.items.map(item => ({
      productId: item.productId._id,
      productName: item.productId.productName,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
      productImages: item.productId.productImages
    }));

    const subTotal = cartItems.reduce((total, item) => total + item.totalPrice, 0);
    const shippingCost = 49;
    const totalAmount = subTotal + shippingCost;

    const address = await Address.findOne({ userId: user });

    
    const currentDate = new Date();
    const availableCoupons = await Coupon.find({
      isList: true,
      expireOn: { $gt: currentDate },
      minimumPrice: { $lte: subTotal },
      userId: { $nin: [user] } 
    }).select('name couponCode offerPrice minimumPrice expireOn');

    
    const coupons = availableCoupons.map(coupon => ({
      code: coupon.couponCode,
      description: `${coupon.name} - Save ₹${coupon.offerPrice} on minimum purchase of ₹${coupon.minimumPrice}`,
      offerPrice: coupon.offerPrice,
      minimumPrice: coupon.minimumPrice,
      expireOn: coupon.expireOn
    }));

    res.render('checkout', {
      cartItems,
      addresses: address,
      subTotal,
      shippingCost,
      totalAmount,
      user: userData,
      coupons, 
    });

  } catch (error) {
    console.error('Checkout error:', error);
    res.redirect('/pageNotFound')
  }
}

const applyCoupon = async (req, res) => { 
  try { 
    const { couponCode } = req.body; 
    console.log('couponCode:', couponCode);
    
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to apply coupon'
      });
    }
    
    const user = req.session.user; 

    const coupon = await Coupon.findOne({  
      couponCode: couponCode, 
      isList: true, 
      expireOn: { $gt: new Date() } 
    }); 

    if (!coupon) { 
      return res.status(400).json({  
        success: false,  
        message: 'Invalid or expired coupon'  
      }); 
    } 

    if (coupon.userId.includes(user)) { 
      return res.status(400).json({  
        success: false,  
        message: 'You have already used this coupon'  
      }); 
    } 

    const cart = await Cart.findOne({ userId: user }).populate('items.productId'); 
    
    if (!cart) {
      return res.status(400).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const subTotal = cart.items.reduce((total, item) => total + item.totalPrice, 0); 

    if (subTotal < coupon.minimumPrice) { 
      return res.status(400).json({  
        success: false,  
        message: `Minimum purchase of ₹${coupon.minimumPrice} required`  
      }); 
    } 
    console.log('subTotal:', subTotal);

    if (couponCode && coupon.offerPrice > 0) {  
      await Coupon.findOneAndUpdate(
        { couponCode: couponCode },
        { $push: { userId: user } },
        { new: true }
      );
    }

    return res.status(200).json({ 
      success: true, 
      discountAmount: coupon.offerPrice, 
      message: 'Coupon applied successfully' 
    }); 

  } catch (error) { 
    console.error('Apply coupon error:', error); 
    return res.status(500).json({  
      success: false,  
      message: 'Failed to apply coupon'  
    }); 
  } 
};






module.exports = {
  viewCheckout,
  applyCoupon,

}