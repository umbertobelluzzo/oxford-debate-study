document.addEventListener('DOMContentLoaded', function() {
    // Target all textareas and text inputs
    const textInputs = document.querySelectorAll('textarea, input[type="text"]');
    
    textInputs.forEach(element => {
      element.addEventListener('paste', function(event) {
        event.preventDefault();
        alert('Pasting is disabled for this study. Please provide your own original writing. Thanks for understanding.');
      });
    });
  });