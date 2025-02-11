
const User = require('../../models/userSchema')
const Category = require('../../models/categorySchema')
const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')
const Banner = require('../../models/bannerSchema')
const nodemailer = require('nodemailer')
const env = require('dotenv').config();
const bcrypt = require('bcrypt')
const { getOrCreateWallet, addWalletTransaction } = require('../../utils/walletUtils') 

const loadHomePage = async (req, res) => {
  try {
    const today = new Date().toISOString();
    const findBanner = await Banner.find({
      startDate: { $lt: new Date(today) },
      endDate: { $gt: new Date(today) }
    });
    const user = req.session.user;
    const categories = await Category.find({ isListed: true });
    let productData = await Product.find({
      isBlock: false,
      category: { $in: categories.map(category => category._id) },
      quantity: { $gt: 0 }
    });

    productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
    productData = productData.slice(0, 6);

    let wishlist = [];
    if (user) {
      const userData = await User.findOne({ _id: user });
      if (userData.isBlocked) {
        req.session.destroy((err) => {
          if (err) {
            return res.status(500).send("Error in destroying session");
          }
          res.redirect('/login');
        });
        return;
      }
      wishlist = userData.wishlist;
    }
    const userData = await User.findOne({_id:user})

    res.render('home', { user:userData || null, products: productData, banner: findBanner || [], wishlist });
  } catch (error) {
    console.log("home page not found", error);
    res.status(500).send("Server error");
  }
};

const pageNotFound = async (req,res)=>{
  try {
    res.render('page-404')
  } catch (error) {
    res.redirect("/pageNotFound")
  }
}

const loadSignup = async (req,res)=>{
  try {
    return res.render('signup')
  } catch (error) {
    console.log("loding signup page issue")
    res.status(500).send('server-Error');
  }
}

const loadLogin = async (req,res)=>{
  try {

    if(!req.session.user){
      return res.render('login')
    }else{
      res.redirect('/')
    }
    
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}



function generateOtp(){
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVarificationEmail(email,otp) {
  try {

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

    const info = await transporter.sendMail({
      from:process.env.NODEMAILER_EMAIL,
      to:email,
      subject:'Verify your email',
      text:`Your verification code is ${otp}`,
      html:`<b>Your verification code is ${otp} </b>`
    })

    return info.accepted.length > 0
    
  } catch (error) {
    console.error("Error sending email",error)
    return false;
  }
}

// const signup = async (req,res)=>{
//   try {

//     const {name,phone,email,password,cPassword} = req.body
//     if(password !==cPassword){
//       return res.render("signup",{message:"passwords dont match"})
//     }

//     const findUser = await User.findOne({email})
//     if(findUser){
//       return res.render("signup",{message:"user with this email already exists"})
//     }

//     const otp = generateOtp();

//     const emailSend = await sendVarificationEmail(email,otp);

//     if(!emailSend){
//       return res.json("email-error")
//     }

//     req.session.userOtp = otp;
//     req.session.userData = {name,phone,email,password};

//     res.render("verify-otp")
//     console.log("OTP :",otp)
    
//   } catch (error) {
//     console.error("signup error",error)
//     res.redirect('/pageNotFound')
//   }
// }

const signup = async (req, res) => {
  try {
    const { name, phone, email, password, cPassword, referralCode } = req.body;
    if (password !== cPassword) {
      return res.render("signup", { message: "Passwords don't match" });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("signup", { message: "User with this email already exists" });
    }

    let referrerId = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.render("signup", { message: "Invalid referral code" });
      }
      referrerId = referrer._id;
    }

    const otp = generateOtp();
    const emailSend = await sendVarificationEmail(email, otp);

    if (!emailSend) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
    req.session.userData = { name, phone, email, password, referrerId };

    res.render("verify-otp");
    console.log("OTP :", otp);
  } catch (error) {
    console.error("signup error", error);
    res.redirect('/pageNotFound');
  }
};

async function securePassword(password) {
  try {

    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
    
  } catch (error) {
    console.log("error in hashing password",error)
  }
}

// const verifyOtp = async (req,res)=>{
//   try {

//     const {otp} = req.body
//     console.log(otp)

//     if(otp === req.session.userOtp){
//       const user = req.session.userData
//       const passwordHash = await securePassword(user.password)

//       const saveUserData = new User({
//         name:user.name,
//         phone:user.phone,
//         email:user.email,
//         password:passwordHash
//       })
//       await saveUserData.save()
//       req.session.user = saveUserData._id;
//       res.json({success:true,redirectUrl:"/"})
//     }else{
//       res.status(400).json({success:false,message:"Invalid otp, Please try again"})
//     }
    
//   } catch (error) {

//     console.error("error verifying otp",error)
//     res.status(500).json({success:false,message:"an error occurred"})
    
//   }
// }

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    console.log(otp);

    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      const passwordHash = await securePassword(user.password);

      const newUser = new User({
        name: user.name,
        phone: user.phone,
        email: user.email,
        password: passwordHash,
        referralCode: user.referralCode
      });

      await newUser.save();

      if (user.referrerId) {
        const referrer = await User.findById(user.referrerId);
        referrer.redeemedUsers.push(newUser._id);
        await referrer.save();

        
        await addWalletTransaction(
          referrer._id,
          100,
          'credit',
          `Referral bonus for referring ${newUser.name}`,
          null
        );

        
        await addWalletTransaction(
          newUser._id,
          50,
          'credit',
          'Referral bonus on sign-up',
          null
        );
      }

      req.session.user = newUser._id;
      res.json({ success: true, redirectUrl: "/" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP, Please try again" });
    }
  } catch (error) {
    console.error("error verifying otp", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};



const resendOTP = async (req,res)=>{
  try {

    const {email} = req.session.userData;
    if(!email){
      return res.status(400).json({success:false,message:"Email not found in session"})
    }

    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSend = await sendVarificationEmail(email,otp)
    if(emailSend){
      console.log("Resend OTP:",otp)
      res.status(200).json({success:true,message:"otp resend successful"})
    }else{
      res.status(500).json({success:false,message:"failed to resend otp"})
    }
    
  } catch (error) {
    console.error("Error in resending otp ",error)
    res.status(500).json({success:false,message:"internal server error"})
  }
}


const login = async (req,res)=>{
  try {

    const {email,password} = req.body;
    

    const findUser = await User.findOne({isAdmin:false,email:email})


    if(!findUser){
      return res.render("login",{message:"User not found"})
    }
    if(findUser.isBlock){
      return res.render('login',{message:"User is blocked by admin"})
    }

    const passwordMatch = await bcrypt.compare(password,findUser.password);
   if(!passwordMatch){
    return res.render('login',{message:"incorrect password"})
   } 

   req.session.user = findUser._id
   res.redirect('/')


  } catch (error) {

    console.error("login error",error)
    res.render('login',{message:"login failed, Please try again later"})
    
  }
}

const logout = async (req,res)=>{
  try {

    req.session.destroy((err)=>{
      if(err){
        console.log("session destruction error",err.message)
        return res.redirect('/pageNotFound')
      }
      return res.redirect('/login')
    })
    
  } catch (error) {

    console.log('logout error',error)
    
  }
}

const loadShopingPage = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findOne({ _id: user });
    
    const categories = await Category.find({ isListed: true });
    const categoryIds = categories.map(category => category._id);

    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const products = await Product.find({
      isBlock: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    }).sort({ createdOn: -1 }).skip(skip).limit(limit);

    

    const totalProducts = await Product.countDocuments({
      isBlock: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    });


    const totalPages = Math.ceil(totalProducts / limit);
    const wishlist = userData.wishlist
    const brands = await Brand.find({isBlocked:false}).lean();
    const categoriesWithIds = categories.map(category => ({ _id: category._id, name: category.name }));

    res.render('shop', {
      user: userData,
      products: products,
      categories: categoriesWithIds,
      brand: brands, 
      totalProducts: totalProducts,
      currentPage: page,
      totalPages: totalPages,
      wishlist
    });

  } catch (error) {
    console.error('Error in loading shopping page:', error);
    res.redirect('/pageNotFound');
  }
}



const applyFilters = async (req, res) => {
  try {
      const { categories, brands, sortBy, search } = req.body;

      let query = {
          isBlock: false,
          quantity: { $gt: 0 }
      };

      if (search && search.trim() !== '') {
          query.productName = { $regex: search, $options: 'i' };
      }

      if (categories && categories.length > 0) {
          query.category = { $in: categories };
      }

      if (brands && brands.length > 0) {
          query.brand = { $in: brands };
      }

      const sortConfig = {
          'low-to-high': { salePrice: 1 },
          'high-to-low': { salePrice: -1 },
          'new-arrivals': { createdAt: -1 },
          'a-to-z': { productName: 1 },
          'z-to-a': { productName: -1 }
      }[sortBy] || { createdAt: -1 };

      const products = await Product.find(query)
          .populate('category')
          .sort(sortConfig)
          .lean();

      res.json({ success: true, products });

  } catch (error) {
      console.error('Error in applyFilters:', error);
      res.status(500).json({
          success: false,
          message: 'Error filtering products'
      });
  }
};






module.exports = {
  loadHomePage,
  pageNotFound,
  loadSignup,
  loadLogin,
  signup,
  verifyOtp,
  resendOTP,
  login,
  logout,
  loadShopingPage,
  applyFilters
}