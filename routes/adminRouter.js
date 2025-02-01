
const express = require('express')
const router = express.Router();
const adminController = require('../controllers/admin/adminController')
const categoryController = require('../controllers/admin/categoryController')
const productController = require('../controllers/admin/productController')
const {isAuthenticated, isLogin} = require('../middlewares/adminAuths')
const brandController = require('../controllers/admin/brandController')
const customerController = require('../controllers/admin/customerController')
const bannerController = require('../controllers/admin/bannerController')
const orderController = require('../controllers/admin/orderController')
const couponController = require('../controllers/admin/couponController')
const salesReportController = require('../controllers/admin/salesReportController')
const multer = require('multer')
const storage = require('../helpers/multer')
const uploads = multer({storage:storage})

router.get('/pageerror',adminController.pageerror)
router.get('/login',adminController.loadLogin)
router.post('/login',adminController.login)
router.get('/',isAuthenticated,adminController.loadDashboard)
router.get('/logout',adminController.logout)
//customer management
router.get('/users',isAuthenticated,customerController.customerInfo)
router.get('/blockCustomer',isAuthenticated,customerController.customerBlocked)
router.get('/unblockCustomer',isAuthenticated,customerController.customerunBlocked)
//category management
router.get('/category',isAuthenticated,categoryController.categoryInfo)
router.post('/addCategory',isAuthenticated,categoryController.addCategory)
router.post('/addCategoryOffer',isAuthenticated,categoryController.addCategoryOffer)
router.post('/removeCategoryOffer',isAuthenticated,categoryController.removeCategoryOffer)
router.get('/listCategory',isAuthenticated,categoryController.getListCategory)
router.get('/unlistCategory',isAuthenticated,categoryController.getUnlistCategory)
router.get('/editCategory',isAuthenticated,categoryController.getEditCategory)
router.post('/editCategory/:id',isAuthenticated,categoryController.editCategory)
//bramd management

router.get('/brands',isAuthenticated,brandController.getBrandPage)
router.post('/addBrand',isAuthenticated,uploads.single('image'),brandController.addBrand)
router.get('/blockBrand',isAuthenticated,brandController.blockBrand)
router.get('/unBlockBrand',isAuthenticated,brandController.unBlockBrand)
router.get('/deleteBrand',isAuthenticated,brandController.deleteBrand)
//product management
router.get('/addProducts',isAuthenticated,productController.getProductAddPage)
router.post('/addProducts',isAuthenticated,uploads.array('images',4),productController.addProducts)
router.get('/products',isAuthenticated,productController.getAllProducts)
router.post('/addProductOffer',isAuthenticated,productController.addProductOffer)
router.post('/removeProductOffer',isAuthenticated,productController.removeProductOffer)
router.get('/blockProduct',isAuthenticated,productController.blockProduct)
router.get('/unblockProduct',isAuthenticated,productController.unblockProduct)
router.get('/editProduct',isAuthenticated,productController.getEditProduct)
router.post('/editProduct/:id',isAuthenticated,uploads.array('images',4),productController.editProduct)
router.post('/deleteImage',isAuthenticated,productController.deleteSingleImage)
//banner management
router.get('/banner',isAuthenticated,bannerController.getBannerPage)
router.get('/addBanner',isAuthenticated,bannerController.getAddBannerPage)
router.post('/addBanner',isAuthenticated,uploads.single('images'),bannerController.addBanner)
router.get('/deleteBanner',isAuthenticated,bannerController.deleteBanner)
//order management

router.get('/orders',isAuthenticated,orderController.orderInfo)
router.post('/order/update-status',isAuthenticated,orderController. updateOrderStatus);
router.get('/orders/filter',isAuthenticated,orderController.getFilteredOrders);
router.get('/orders/sales-report',isAuthenticated,orderController.getSalesReport);
router.post('/order/cancel',isAuthenticated,orderController. cancelOrder);
router.get('/order/:orderId',isAuthenticated,orderController.getOrderDetails);
router.post('/order/update-return-status',isAuthenticated,orderController.updateReturnStatus);

//coupon management
router.get('/coupon',isAuthenticated,couponController.loadCoupon)
router.post('/createCoupon',isAuthenticated,couponController.createCoupon)
router.get('/editCoupon',isAuthenticated,couponController.editCoupon)
router.post('/updateCoupon',isAuthenticated,couponController.updateCoupon)
router.delete('/deleteCoupon',isAuthenticated,couponController.deleteCoupon)

//sales report management
router.get('/sales-report',isAuthenticated,salesReportController.getSalesReport)
router.get('/sales-report/export',isAuthenticated,salesReportController.exportSalesReport)

module.exports = router