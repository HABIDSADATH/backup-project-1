
const User = require('../../models/userSchema')
const Category = require('../../models/categorySchema')
const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')
const Banner = require('../../models/bannerSchema')
const nodemailer = require('nodemailer')
const env = require('dotenv').config();
const bcrypt = require('bcrypt')


const loadHomePage = async (req,res)=>{
  try {
    const today = new Date().toISOString()
    const findBanner = await Banner.find({
      startDate:{$lt:new Date(today)},
      endDate:{$gt:new Date(today) }
    })
    const user = req.session.user;
    const categories = await Category.find({isListed:true})
    let productData = await Product.find(
      {isBlock:false,
        category:{$in:categories.map(category=>category._id)},quantity:{$gt:0}
      }
    )
    
    productData.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn))
  
    productData = productData.slice(0,6)
    if(user){

      const userData = await User.findOne({_id:user});
      if(userData.isBlocked){
        req.session.destroy((err)=>{
          if(err){
            return res.status(500).send("Error in destroying session")
          }
          res.redirect('/login')
        })
        return
      }

      
      return res.render('home',{user:userData,products:productData,banner:findBanner||[]})
    }else{
      
      return res.render('home',{products:productData,banner:findBanner||[]})
    }

  } catch (error) {
    console.log("home page not found")
    res.status(500).send("Server error")
  }
}

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

const signup = async (req,res)=>{
  try {

    const {name,phone,email,password,cPassword} = req.body
    if(password !==cPassword){
      return res.render("signup",{message:"passwords dont match"})
    }

    const findUser = await User.findOne({email})
    if(findUser){
      return res.render("signup",{message:"user with this email already exists"})
    }

    const otp = generateOtp();

    const emailSend = await sendVarificationEmail(email,otp);

    if(!emailSend){
      return res.json("email-error")
    }

    req.session.userOtp = otp;
    req.session.userData = {name,phone,email,password};

    res.render("verify-otp")
    console.log("OTP :",otp)
    
  } catch (error) {
    console.error("signup error",error)
    res.redirect('/pageNotFound')
  }
}

async function securePassword(password) {
  try {

    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
    
  } catch (error) {
    console.log("error in hashing password",error)
  }
}

const verifyOtp = async (req,res)=>{
  try {

    const {otp} = req.body
    console.log(otp)

    if(otp === req.session.userOtp){
      const user = req.session.userData
      const passwordHash = await securePassword(user.password)

      const saveUserData = new User({
        name:user.name,
        phone:user.phone,
        email:user.email,
        password:passwordHash
      })
      await saveUserData.save()
      req.session.user = saveUserData._id;
      res.json({success:true,redirectUrl:"/"})
    }else{
      res.status(400).json({success:false,message:"Invalid otp, Please try again"})
    }
    
  } catch (error) {

    console.error("error verifying otp",error)
    res.status(500).json({success:false,message:"an error occurred"})
    
  }
}

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
    const limit = 12;
    const skip = (page - 1) * limit;

    const products = await Product.find({
      isBlock: false,
      // category: { $in: categoryIds },
      quantity: { $gt: 0 },
    }).sort({ createdOn: -1 }).skip(skip).limit(limit);

    

    const totalProducts = await Product.countDocuments({
      isBlock: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    });

    console.log('total products are',totalProducts)

    const totalPages = Math.ceil(totalProducts / limit);

    const brands = await Brand.find({ isBlocked: false });
    const categoriesWithIds = categories.map(category => ({ _id: category._id, name: category.name }));

    res.render('shop', {
      user: userData,
      products: products,
      category: categoriesWithIds,
      brand: brands, 
      totalProducts: totalProducts,
      currentPage: page,
      totalPages: totalPages,
    });

  } catch (error) {
    console.error('Error in loading shopping page:', error);
    res.redirect('/pageNotFound');
  }
}


const filerProduct = async (req, res) => {
  try {
    const user = req.session.user
    const category = req.query.category
    const brand = req.query.brand

    const findCategory = category ? await Category.findOne({ _id: category }) : null
    const findBrand = brand ? await Brand.findOne({ _id: brand }) : null
    const brands = await Brand.find({}).lean()

    
    const query = {
      isBlock: false,
      quantity: { $gt: 0 }
    }

    if (findCategory) {
      query.category = findCategory._id;
    }
    if (findBrand) {
      query.brand = findBrand.brandName;
    }

    let findProducts = await Product.find(query).lean();
    findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const categories = await Category.find({ isListed: true });

    let itemsPerPage = 6; 
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProducts.length / itemsPerPage);
    const currentProduct = findProducts.slice(startIndex, endIndex);

    let userData = null;
    if (user) {
      userData = await User.findOne({ _id: user });
      if (userData) {
        const searchEntry = {
          category: findCategory ? findCategory._id : null,
          brand: findBrand ? findBrand.brandName : null,
          searchedOn: new Date()
        };
        userData.searchHistory.push(searchEntry);
        await userData.save();
      }
    }

    req.session.filteredProducts = currentProduct;
    res.render('shop', {
      user: userData,
      products: currentProduct,
      category: categories,
      brand: brands,
      totalPages,
      currentPage,
      selectedCategory: category || null,
      selectedBrand: brand || null
    });

  } catch (error) {
    console.error('Error in search and filter:', error);
    res.redirect('/pageNotFound');
  }
}

const filterByPrice = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }).lean() : null;
    const brands = await Brand.find({}).lean();
    const categories = await Category.find({ isListed: true }).lean();

    
    const sort = req.query.sort || 'asc'; 
    const sortOrder = sort === 'desc' ? -1 : 1;

    
    let findProducts = await Product.find({
      isBlock: false,
      quantity: { $gt: 0 }
    })
      .sort({ salePrice: sortOrder }) 
      .lean();

    
    let itemsPerPage = 12;
    let currentPage = parseInt(req.query.page) || 1
    let startIndex = (currentPage - 1) * itemsPerPage
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProducts.length / itemsPerPage)
    const currentProduct = findProducts.slice(startIndex, endIndex)

    req.session.filteredProducts = findProducts;

    
    res.render('shop', {
      user: userData,
      products: currentProduct,
      category: categories,
      brand: brands,
      totalPages,
      currentPage,
      sort 
    });
  } catch (error) {
    console.log('Error in price sorting:', error);
    res.redirect('/pageNotFound');
  }
};



const alphabeticSort = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }).lean() : null;
    const brands = await Brand.find({}).lean();
    const categories = await Category.find({ isListed: true }).lean();
    
    const sortOrder = req.query.order || 'asc'; 
    
    let findProducts = await Product.find({
      isBlock: false,
      quantity: { $gt: 0 }
    }).lean();
    
    
    if (sortOrder === 'asc') {
      findProducts.sort((a, b) => 
        a.productName.toLowerCase().localeCompare(b.productName.toLowerCase())
      );
    } else {
      findProducts.sort((a, b) => 
        b.productName.toLowerCase().localeCompare(a.productName.toLowerCase())
      );
    }
    
    let itemsPerPage = 6;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProducts.length / itemsPerPage);
    const currentProduct = findProducts.slice(startIndex, endIndex);

    res.render('shop', {
      user: userData,
      products: currentProduct,
      category: categories,
      brand: brands,
      totalPages,
      currentPage,
      currentSort: sortOrder
    });
  } catch (error) {
    console.log('Error in alphabetic sorting:', error);
    res.redirect('/pageNotFound');
  }
}

const latestSort = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findOne({ _id: user }).lean() : null;
    const brands = await Brand.find({}).lean();
    const categories = await Category.find({ isListed: true }).lean();
    
    const sortOrder = req.query.order || 'desc'; 
    
    let findProducts = await Product.find({
      isBlock: false,
      quantity: { $gt: 0 }
    }).lean();
    
    if (sortOrder === 'asc') {
      findProducts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else {
      findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    let itemsPerPage = 6;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProducts.length / itemsPerPage);
    const currentProduct = findProducts.slice(startIndex, endIndex);

    res.render('shop', {
      user: userData,
      products: currentProduct,
      category: categories,
      brand: brands,
      totalPages,
      currentPage,
      currentSort: sortOrder
    });
  } catch (error) {
    console.log('Error in latest sorting:', error);
    res.redirect('/pageNotFound');
  }
}

const searchProducts = async (req,res)=>{
  
  console.log('searching products')
  try {

    const user = req.session.user
    
    const userData = await User.findOne({ _id: user })
    
    let {search} = req.body

    const brands = await Brand.find({}).lean()
    const categories = await Category.find({ isListed: true }).lean()
     
    const categoryIds = categories.map(category=>category._id.toString())
    let searchResult = []
    if(req.session.filteredProducts && req.session.filteredProducts.length>0){
      searchResult = req.session.filteredProducts.filter(product=>
        product.name.toLowerCase().includes(search.toLowerCase()) 
      )
    }else{
      searchResult = await Product.find({
        productName:{$regex:'.*'+search+'.*',$options:'i'},
        isBlock:false,
        quantity:{$gt:0},
        category:{$in:categoryIds}
      })
    }

    searchResult.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))

    let itemsPerPage = 6;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(searchResult.length / itemsPerPage);
    const currentProduct = searchResult.slice(startIndex, endIndex);

    res.render('shop',{
      user:userData,
      products:currentProduct,
      category:categories,
      brand:brands,
      totalPages,
      currentPage,
      count:searchResult.length
    })
    
  } catch (error) {
    console.log('error in search ',error)
    res.redirect('/pageNotFound')
  }
}






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
  filerProduct,
  filterByPrice,
  searchProducts,
  alphabeticSort,
  latestSort

}