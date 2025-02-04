




const Wallet = require('../models/walletSchema')
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId });
    await wallet.save();
  }
  return wallet;
};

const addWalletTransaction = async (userId, amount, type, description, orderId) => {
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
};

module.exports = {
  getOrCreateWallet,
  addWalletTransaction
}