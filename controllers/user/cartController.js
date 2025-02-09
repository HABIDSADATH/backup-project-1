



const User = require('../../models/userSchema')
const Cart = require('../../models/cartSchema')
const Product = require('../../models/productSchema')


const addToCart = async (req, res) => {
  
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(200).json({ success: false, message: 'User  not logged in' });
    }

    const productId = req.body.productId;
    
    const quantity = parseInt(req.body.quantity, 10);

   
    if (!productId || !quantity || quantity <= 0) {
      return res.status(200).json({ success: false, message: 'Valid Product ID and quantity are required' });
    }

    
    if (quantity > 10) {
      return res.status(200).json({ success: false, message: 'You can only add a maximum of 10 units of a product to the cart' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(200).json({ success: false, message: 'Product not found' });
    }

    
    if (product.quantity < quantity) {
      return res.status(200).json({ success: false, message: 'Not enough stock available' });
    }

    let cart = await Cart.findOne({ userId: user });
    if (!cart) {
      cart = new Cart({ userId: user, items: [] });
    }

    const itemIndex = cart.items.findIndex(item => item.productId.equals(productId));

    if (itemIndex > -1) {
      const newQuantity = cart.items[itemIndex].quantity + quantity;

     
      if (newQuantity > 10) {
        return res.status(200).json({ success: false, message: 'You can only have a maximum of 10 units of a product in your cart' });
      }

      
      if (newQuantity > product.quantity) {
        return res.status(200).json({ success: false, message: 'Exceeding stock limit' });
      }

      cart.items[itemIndex].quantity = newQuantity;
      cart.items[itemIndex].totalPrice = newQuantity * product.salePrice;
    } else {
      
      cart.items.push({
        productId,
        quantity,
        price: product.salePrice,
        totalPrice: product.salePrice * quantity
      });
    }

    await cart.save();
    res.status(200).json({ success: true, message: 'Product added to cart' });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};




const viewCart = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findById(user);

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const cart = await Cart.findOne({ userId: user }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.render('cart', { cartItems: [], user: userData, message: 'Your cart is empty', currentPage: page, totalPages: 0 });
    }

    const updatedItems = await Promise.all(cart.items.map(async (item) => {
      const product = await Product.findById(item.productId);
      if (!product || product.quantity <= 0) {
        await Cart.updateOne(
          { userId: user },
          { $pull: { items: { productId: item.productId } } }
        );
        return null; 
      }
      return {
        productId: item.productId._id,
        productName: item.productId.productName,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        productImages: item.productId.productImages
      };
    }));

    const cartItems = updatedItems.filter(item => item !== null);
    const totalItems = cartItems.length;
    const paginatedItems = cartItems.slice(skip, skip + limit);
    const totalPages = Math.ceil(totalItems / limit);

    res.render('cart', { cartItems: paginatedItems, user: userData, currentPage: page, totalPages });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).render('error', { message: 'Internal Server Error' });
  }
};





const mongoose = require('mongoose');

const removeFromCart = async (req, res) => {
  try {
      const userId = req.session.user
      const itemId = req.body.itemId

      

      if (!userId) {
          return res.status(200).json({ success: false, message: 'User not logged in' });
      }

      if (!itemId) {
          return res.status(200).json({ success: false, message: 'Item ID is required' });
      }

      
      const objectId = new mongoose.Types.ObjectId(itemId);

      const cart = await Cart.findOneAndUpdate(
        { userId: userId },
        { $pull: { items: { productId: objectId } } },
        { new: true }
      ).populate('items.productId')

      if (!cart) {
          return res.status(200).json({ success: false, message: 'Cart not found' });
      }

      res.status(200).json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
      console.error('Error removing item from cart:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

 const updateCartQuantity = async (req, res) => {
  try {

    const { productId, quantity } = req.body
        const userId = req.session.user

        const product = await Product.findById(productId)
        
        const cartItem = await Cart.findOne({
            userId: userId,
            'items.productId': productId
        });

        if (quantity > 10) {
          return res.status(400).json({
            success: false,
            message: 'You can only set a maximum of 10 units for a product in the cart'
          });
        }

        if(product.quantity < quantity) {
          return res.status(404).json({
            success: false,
            message: 'Not enough stock available'
          })
        }



        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Cart item not found'
            });
        }

        
        const updatedCart = await Cart.findOneAndUpdate(
            { 
                userId: userId,
                'items.productId': productId 
            },
            { 
                $set: { 
                    'items.$.quantity': quantity,
                    'items.$.totalPrice': quantity * cartItem.items[0].price
                } 
            },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Cart updated successfully',
            cart: updatedCart
        });
    
  } catch (error) {
    console.error('Error updating cart:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating cart quantity'
        })
    
  }
 }




  module.exports = {
    addToCart,
    viewCart,
    removeFromCart,
    updateCartQuantity

  }
