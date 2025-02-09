




const AdminWallet = require('../../models/adminWalletTransactionSchema');
const User = require('../../models/userSchema');

const getTransactions = async (req, res) => {
  try {
    const adminWallet = await AdminWallet.findOne().populate('transactions.user');
    if (!adminWallet) {
      return res.status(404).render('transactions', {
        success: false,
        message: 'Admin wallet not found',
        transactions: [],
        transactionDetails: null
      });
    }

    const transactions = adminWallet.transactions.map(transaction => ({
      transactionId: transaction.transactionId,
      transactionDate: transaction.createdAt,
      user: transaction.user,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status
    }));

    // Render the page without transaction details initially
    return res.render('transactions', {
      success: true,
      transactions,
      transactionDetails: null
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).render('transactions', {
      success: false,
      message: 'An error occurred while fetching transactions',
      transactions: [],
      transactionDetails: null
    });
  }
};

const getTransactionDetails = async (req, res) => {
  console.log('transaction details')
  try {
    const { transactionId } = req.params;
    const adminWallet = await AdminWallet.findOne({ 'transactions.transactionId': transactionId }).populate('transactions.user transactions.orderId');
    if (!adminWallet) {
      return res.status(404).render('transactions', {
        success: false,
        message: 'Admin wallet not found',
        transactions: [],
        transactionDetails: null
      });
    }

    const transaction = adminWallet.transactions.find(tx => tx.transactionId === transactionId);
    if (!transaction) {
      return res.status(404).render('transactions', {
        success: false,
        message: 'Transaction not found',
        transactions: [],
        transactionDetails: null
      });
    }

    const transactionDetails = {
      user: transaction.user,
      transactionId: transaction.transactionId,
      transactionDate: transaction.createdAt,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      orderId: transaction.orderId
    };

    // Fetch all transactions again
    const transactions = adminWallet.transactions.map(transaction => ({
      transactionId: transaction.transactionId,
      transactionDate: transaction.createdAt,
      user: transaction.user,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status
    }));

    return res.render('transactions', {
      success: true,
      transactions,
      transactionDetails
    });
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    return res.status(500).render('transactions', {
      success: false,
      message: 'An error occurred while fetching transaction details',
      transactions: [],
      transactionDetails: null
    });
  }
};

module.exports = {
  getTransactions,
  getTransactionDetails
};