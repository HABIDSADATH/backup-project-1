




const Cart = require('../../models/cartSchema')
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const User = require('../../models/userSchema')
const Coupon = require('../../models/couponSchema')
const Order = require('../../models/orderSchema')




const viewCheckout = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findById(user);

    const cart = await Cart.findOne({ userId: user }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.render('cart', { cartItems: [], user: userData, message: 'Your cart is empty' });
    }

    const cartItems = cart.items.map(item => ({
      productId: item.productId._id,
      productName: item.productId.productName,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice, 
      productImages: item.productId.productImages
    }));

    
    const totalWithGST = cartItems.reduce((total, item) => total + item.totalPrice, 0);

    
    const gstAmount = Math.round(totalWithGST * 0.18);

    const shippingCost = 49;

    
    const finalAmount = totalWithGST + gstAmount + shippingCost;

    const address = await Address.findOne({ userId: user });

    const currentDate = new Date();
    const availableCoupons = await Coupon.find({
      isList: true,
      expireOn: { $gt: currentDate },
      minimumPrice: { $lte: totalWithGST },
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
      subTotal: totalWithGST, 
      gstAmount, 
      shippingCost,
      finalAmount, 
      user: userData,
      coupons,
    });

  } catch (error) {
    console.error('Checkout error:', error);
    res.redirect('/pageNotFound');
  }
};

const applyCoupon = async (req, res) => { 
  try { 
    const { couponCode } = req.body; 
    
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

    
    const usedInOrder = await Order.findOne({
      userId: user,
      'coupon.code': couponCode,
      status: { $in: ['completed', 'delivered'] }
    })

    if (usedInOrder) { 
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

const removeCoupon = async (req, res) => {
  try {
      if (!req.session || !req.session.user) {
          return res.status(401).json({
              success: false,
              message: 'Please login to remove coupon'
          });
      }

      const user = req.session.user;
      const cart = await Cart.findOne({ userId: user });

      if (!cart) {
          return res.status(400).json({
              success: false,
              message: 'Cart not found'
          });
      }
     
      cart.appliedCoupon = null;  
      cart.discountAmount = 0;

      await cart.save();

      return res.status(200).json({
          success: true,
          message: 'Coupon removed successfully',
      });

  } catch (error) {
      console.error('Remove coupon error:', error);
      return res.status(500).json({
          success: false,
          message: 'Failed to remove coupon'
      });
  }
};


const addAddress = async (req, res) => {
  try {
      const user = req.session.user;
      const userData = await User.findOne({ _id: user });
      const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;

      const userAddress = await Address.findOne({ userId: userData._id });
      let newAddressData;

      if (!userAddress) {
          const newAddress = new Address({
              userId: userData._id,
              address: [{
                  addressType, name, city, landMark, state, pincode, phone, altPhone
              }]
          });
          await newAddress.save();
          newAddressData = newAddress.address[0];
      } else {
          const addressObj = {
              addressType, name, city, landMark, state, pincode, phone, altPhone
          };
          userAddress.address.push(addressObj);
          await userAddress.save();
          newAddressData = userAddress.address[userAddress.address.length - 1];
      }

      res.json({
          success: true,
          address: newAddressData
      });

  } catch (error) {
      console.log('Error adding address:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to add address'
      });
  }
};




module.exports = {
  viewCheckout,
  applyCoupon,
  addAddress,
  removeCoupon
}