const Wallet = require('../models/walletSchema');
const AdminWallet = require('../models/adminWalletTransactionSchema');

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


const processRefund = async (userId, refundAmount, orderId) => {
  try {
    
    refundAmount = Math.floor(refundAmount);

    
    const wallet = await getOrCreateWallet(userId);
    await addWalletTransaction(
      userId,
      refundAmount,
      'credit',
      `Refund for returned product in order #${orderId}`,
      orderId
    );

    
    let adminWallet = await AdminWallet.findOne();
    if (!adminWallet) {
      adminWallet = new AdminWallet();
    }

    
    if (adminWallet.balance < refundAmount) {
      console.error("Admin wallet balance is insufficient to process the refund for order #", orderId);
      throw new Error("Admin wallet balance is insufficient to process the refund");
    }

    
    const transaction = {
      user: userId,
      amount: refundAmount,
      type: 'debit',
      description: `Refund for returned product in order #${orderId}`,
      orderId: orderId,
      status: 'completed'
    };

    adminWallet.transactions.push(transaction);
    adminWallet.balance -= refundAmount;
    await adminWallet.save();

  } catch (walletError) {
    console.error("Wallet transaction error:", walletError);
    throw walletError;
  }
};

module.exports = {
  getOrCreateWallet,
  addWalletTransaction,
  processRefund
};  