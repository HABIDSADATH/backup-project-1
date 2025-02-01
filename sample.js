




function handleCheckout() {
  const selectedAddress = document.querySelector('input[name="addressId"]:checked');
  const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');
  const finalAmount = document.getElementById('finalAmountId').textContent;
  const discountAmount = document.getElementById('discountAmount').textContent;

  if (!selectedAddress) {
      Swal.fire({
          icon: 'error',
          title: 'Please select a delivery address',
          confirmButtonColor: '#f7444e'
      });
      return;
  }

  const checkoutData = {
      addressId: selectedAddress.value,
      paymentMethod: selectedPayment.value,
      finalAmount: finalAmount,
      discountAmount: discountAmount
  };

  if (selectedPayment.value === 'online') {
      // Rest of your existing Razorpay payment code remains the same
      fetch('/create-order', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              amount: parseFloat(finalAmount),
              currency: 'INR'
          })
      })
      // ... rest of your Razorpay code ...
  } else {
      // Simplified COD flow without loader
      fetch('/placeOrder', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              ...checkoutData,
              paymentMethod: 'cod',
              paymentStatus: 'pending'
          })
      })
      .then(response => {
          if (!response.ok) {
              throw new Error('Network response was not ok');
          }
          return response.json();
      })
      .then(data => {
          if (data.success) {
              Swal.fire({
                  icon: 'success',
                  title: 'Order Placed Successfully!',
                  text: 'Thank you for your order.',
                  confirmButtonColor: '#f7444e'
              }).then(() => {
                  window.location.href = `/order/${data.orderId}`;
              });
          } else {
              throw new Error(data.message || 'Failed to place order');
          }
      })
      .catch(error => {
          Swal.fire({
              icon: 'error',
              title: 'Oops...',
              text: error.message || 'Something went wrong!',
              confirmButtonColor: '#f7444e'
          });
      });
  }
}