




const Wallet = require('../../models/walletSchema')
const Order = require('../../models/orderSchema')



const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId });
    await wallet.save();
  }
  return wallet;
};


const addWalletTransaction = async (userId, amount, type, description, orderId) => {
  try {
    const wallet = await getOrCreateWallet(userId);
    
    const transaction = {
      amount,
      type,
      description,
      orderId,
      status: 'completed'
    };

    if (type === 'credit') {
      wallet.balance += amount;
    } else if (type === 'debit') {
      if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }
      wallet.balance -= amount;
    }

    wallet.transactions.push(transaction);
    await wallet.save();
    return wallet;
  } catch (error) {
    console.error('Wallet transaction error:', error);
    throw error;
  }
};


const getWalletDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const wallet = await Wallet.findOne({ userId }).populate('transactions.orderId');
    
    res.render('wallet', { 
      wallet: wallet || { balance: 0, transactions: [] }
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.redirect('/error');
  }
};

module.exports = {
  addWalletTransaction,
  getWalletDetails

}