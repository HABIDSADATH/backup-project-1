const express = require('express');
const app = express();
const session = require('express-session');
const path = require('path');
const passport = require('./config/passport');
const env = require('dotenv').config();
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');


db();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 72 * 60 * 60 * 1000, 
    },
  })
);


app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});


app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')])


app.use(express.static(path.join(__dirname, 'public')));


app.use('/', userRouter);
app.use('/admin', adminRouter);



app.use((req, res, next) => {
  res.status(404);
  const isAdminRoute = req.originalUrl.startsWith('/admin');
  res.render(isAdminRoute ? "admin-error" : "page-404", { 
      title: "Page Not Found", 
      message: "The page you are looking for does not exist.",
      status: 404,
  });
});

// General Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack); 
  res.status(500).render('error', {
      title: "Internal Server Error",
      message: "Something went wrong on our end. Please try again later.",
      status: 500,
  });
});




const port = process.env.PORT || 3000; 
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
}); 


module.exports = app;