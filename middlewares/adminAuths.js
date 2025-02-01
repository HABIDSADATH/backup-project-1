



const isAuthenticated = (req,res,next)=>{
  if(req.session.admin){
    next()
    
  }else{
    
    return res.redirect('/admin/login')
  }
}


const isLogin = (req,res,next)=>{
  if(!req.session.admin){
    return res.redirect('/admin/login')
  }else{
    next()
  }
}

module.exports = {isAuthenticated,isLogin}