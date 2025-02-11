

const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
  try {
    
    if (req.session.user) {
      const userData = await User.findById(req.session.user); 

      
      if (userData.isBlocked) {
        req.session.destroy((err) => {
          if (err) {
            return res.status(500).send("Error in destroying session");
          }
          return res.redirect('/login'); 
        });
      } else {
        return next(); 
      }
    } else {
      return res.redirect('/login'); 
    }
  } catch (err) {
    console.error("Error in userAuth middleware:", err);
    return res.status(500).send("Internal Server Error");
  }
};



const userLogin = (req,res,next)=>{
  if(req.session.user){
    return res.redirect('/')
  }else{
    return next()
  }
}




module.exports = {userAuth,userLogin}