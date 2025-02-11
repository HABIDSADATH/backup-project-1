




const Order = require('../../models/orderSchema')

const getSalesReport = async (req, res) => {
    try {
      const { startDate, endDate, reportType } = req.query;
      const page = parseInt(req.query.page) || 1;
      const limit = 4; // Adjust limit as needed
      let query = {};
      let dateRange = {};
  
      // Your existing date range logic
      switch (reportType) {
        case 'daily':
          dateRange = {
            startDate: new Date(new Date().setHours(0, 0, 0, 0)),
            endDate: new Date(new Date().setHours(23, 59, 59, 999))
          };
          break;
        case 'weekly':
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          weekStart.setHours(0, 0, 0, 0);
          dateRange = {
            startDate: weekStart,
            endDate: new Date()
          };
          break;
        case 'monthly':
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          dateRange = {
            startDate: monthStart,
            endDate: new Date()
          };
          break;
        case 'custom':
          dateRange = {
            startDate: new Date(startDate),
            endDate: new Date(endDate)
          };
          break;
        default:
          dateRange = {
            startDate: new Date(new Date().setHours(0, 0, 0, 0)),
            endDate: new Date(new Date().setHours(23, 59, 59, 999))
          };
      }
  
      query = {
        createdOn: {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate
        },
        status: { $nin: ['cancelled'] }
      };
  
      // Get total count for pagination
      const totalOrders = await Order.countDocuments(query);
  
      // Get paginated orders
      const orders = await Order.find(query)
        .sort({ createdOn: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
  
      // Calculate totals from all orders (not just paginated ones)
      const allOrders = await Order.find(query);
      const reportData = {
        totalOrders: allOrders.length,
        totalSales: allOrders.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
        totalDiscount: allOrders.reduce((sum, order) => sum + (order.discount || 0), 0),
        couponDiscount: allOrders.reduce((sum, order) => {
          if (order.couponApplied) {
            return sum + ((order.totalPrice - order.finalAmount) || 0);
          }
          return sum;
        }, 0),
        // Paginated orders for display
        orders: orders.map(order => ({
          orderId: order.orderId,
          date: order.createdOn,
          amount: order.finalAmount,
          discount: order.discount,
          status: order.status,
          paymentMethod: order.paymentMethod
        }))
      };
  
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.json({
          ...reportData,
          currentPage: page,
          totalPages: Math.ceil(totalOrders / limit)
        });
      } else {
        return res.render('sales-report', {
          reportData,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          reportType,
          title: 'Sales Report',
          currentPage: page,
          totalPages: Math.ceil(totalOrders / limit)
        });
      }
  
    } catch (error) {
      console.error('Error generating sales report:', error);
      res.status(500).json({
        status: false,
        message: 'Error generating sales report'
      });
    }
  };




const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');


const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
};


const getDateRange = (reportType, startDate, endDate) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    switch (reportType) {
        case 'daily':
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;
        case 'weekly':
            start.setDate(now.getDate() - now.getDay());
            start.setHours(0, 0, 0, 0);
            break;
        case 'monthly':
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'custom':
            start = new Date(startDate);
            end = new Date(endDate);
            break;
    }
    return { start, end };
};

const exportSalesReport = async (req, res) => {
    try {
        const { type, reportType, startDate, endDate } = req.query;
        const dateRange = getDateRange(reportType, startDate, endDate);

        
        const orders = await Order.find({
            createdOn: {
                $gte: dateRange.start,
                $lte: dateRange.end
            },
            status: { $nin: ['cancelled'] }
        }).populate('userId', 'name email');

        
        const totals = {
            totalSales: orders.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
            totalDiscount: orders.reduce((sum, order) => sum + (order.discount || 0), 0),
            totalOrders: orders.length
        };

        if (type === 'excel') {
            await generateExcelReport(orders, totals, dateRange, res);
        } else if (type === 'pdf') {
            await generatePDFReport(orders, totals, dateRange, res);
        } else {
            res.status(400).json({ status: false, message: 'Invalid export type' });
        }

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ status: false, message: 'Error generating report' });
    }
};

const generateExcelReport = async (orders, totals, dateRange, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    
    worksheet.mergeCells('A1:G1');
    worksheet.getCell('A1').value = 'Sales Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    
    worksheet.mergeCells('A2:G2');
    worksheet.getCell('A2').value = `Period: ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    
    worksheet.addRow(['']);
    worksheet.addRow(['Summary']);
    worksheet.addRow(['Total Orders', totals.totalOrders]);
    worksheet.addRow(['Total Sales', formatCurrency(totals.totalSales)]);
    worksheet.addRow(['Total Discount', formatCurrency(totals.totalDiscount)]);
    worksheet.addRow(['Net Amount', formatCurrency(totals.totalSales - totals.totalDiscount)]);
    worksheet.addRow(['']);

    
    worksheet.addRow([
        'Order ID',
        'Date',
        'Customer',
        'Amount',
        'Discount',
        'Final Amount',
        'Status'
    ]);

    
    worksheet.getRow(8).font = { bold: true };
    worksheet.getRow(8).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    
    orders.forEach(order => {
        worksheet.addRow([
            order.orderId,
            new Date(order.createdOn).toLocaleDateString(),
            order.userId?.name || 'N/A',
            order.totalPrice,
            order.discount,
            order.finalAmount,
            order.status
        ]);
    });

    
    worksheet.columns.forEach(column => {
        column.width = 15;
        column.alignment = { horizontal: 'left' };
    });

    
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        'attachment; filename=sales-report.xlsx'
    );

    
    await workbook.xlsx.write(res);
};

const generatePDFReport = async (orders, totals, dateRange, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

    
    doc.pipe(res);

    
    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.moveDown();

    
    doc.fontSize(12).text(
        `Period: ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`,
        { align: 'center' }
    );
    doc.moveDown();

    
    const summaryTable = {
        headers: ['Metric', 'Value'],
        rows: [
            ['Total Orders', totals.totalOrders.toString()],
            ['Total Sales', formatCurrency(totals.totalSales)],
            ['Total Discount', formatCurrency(totals.totalDiscount)],
            ['Net Amount', formatCurrency(totals.totalSales - totals.totalDiscount)]
        ]
    };

    await doc.table(summaryTable, {
        prepareHeader: () => doc.font('Helvetica-Bold'),
        prepareRow: () => doc.font('Helvetica')
    });
    
    doc.moveDown();

    
    const ordersTable = {
        headers: ['Order ID', 'Date', 'Amount', 'Discount', 'Final', 'Status'],
        rows: orders.map(order => [
            order.orderId,
            new Date(order.createdOn).toLocaleDateString(),
            formatCurrency(order.totalPrice),
            formatCurrency(order.discount),
            formatCurrency(order.finalAmount),
            order.status
        ])
    };

    await doc.table(ordersTable, {
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
        prepareRow: () => doc.font('Helvetica').fontSize(10)
    });

    
    doc.end();
};



module.exports = {
  getSalesReport,
  exportSalesReport
}