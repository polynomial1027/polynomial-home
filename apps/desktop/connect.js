window.polynomialConnection.get().then(value=>document.querySelector('#server').value=value);
document.querySelector('#connect').onsubmit=async event=>{event.preventDefault();try{await window.polynomialConnection.connect(document.querySelector('#server').value.trim());}catch(error){document.querySelector('#notice').textContent=error.message;}};
