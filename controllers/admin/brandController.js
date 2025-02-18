


const Brand = require('../../models/brandSchema')
const Product = require('../../models/productSchema')


const getBrandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = 4
    const skip = (page - 1) * limit
    const brandData = await Brand.find().sort({createdAt:-1}).skip(skip).limit(limit)
    const totalBrands = await Brand.countDocuments()
    const totalPages = Math.ceil(totalBrands/limit)
    
    
    res.render('brands', {
      data: brandData,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands
    })
    
  } catch (error) {
    console.log('brand page load error:', error)
    res.redirect('/pageerror')
  }
}

const addBrand = async (req, res) => {
  try {
    const brand = req.body.name

    
    if (!brand) {
      return res.redirect('/admin/brands')
    }

    const findBrand = await Brand.findOne({brandName: brand})
    
    if (findBrand) {
      
      return res.redirect('/admin/brands')
    }

    
    if (!req.file) {
      return res.redirect('/admin/brands')
    }

    const newBrand = new Brand({
      brandName: brand,
      brandImage: req.file.filename  
    })

    await newBrand.save()
    res.redirect('/admin/brands')
    
  } catch (error) {
    console.log('add brand error:', error)
    res.redirect('/pageerror')
  }
}

const blockBrand = async (req,res)=>{
  try {

    const id = req.query.id
    await Brand.updateOne({_id:id},{$set:{isBlocked:true}})
    res.redirect('/admin/brands')
    
  } catch (error) {
    res.redirect('/pageerror')
  }
}

const unBlockBrand = async (req,res)=>{
  try {

    const id = req.query.id
    await Brand.updateOne({_id:id},{$set:{isBlocked:false}})
    res.redirect('/admin/brands')
    
  } catch (error) {
    res.redirect('/pageerror')
  }
}

const deleteBrand = async (req,res)=>{
  try {

    const {id} = req.query
    if(!id){
      return res.status(400).redirect('/pageerror')
    }
    await Brand.deleteOne({_id:id})
    res.redirect('/admin/brands')
    
  } catch (error) {
    console.error("error in deleting brand",error)
    res.status(500).redirect('/pageerror')
  }
}

module.exports = {
  getBrandPage,
  addBrand,
  blockBrand,
  unBlockBrand,
  deleteBrand

}