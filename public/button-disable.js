document.addEventListener('DOMContentLoaded', function () {
    // Find all forms in the document
    const forms = document.querySelectorAll('form');
    
    // Track if a form is currently being submitted
    let isSubmitting = false;

    forms.forEach(form => {
        form.addEventListener('submit', function (event) {
            // If a submission is already in progress, prevent this one
            if (isSubmitting) {
                event.preventDefault();
                return false;
            }
            
            // Set the flag to prevent additional submissions
            isSubmitting = true;
            
            // Find all submit buttons within this form
            const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"], .button[type="submit"]');

            // Find the primary submit button (the one that says "Continue")
            const continueButton = form.querySelector('button.button');

            if (continueButton) {
                // Change the text to show processing status
                const originalText = continueButton.textContent;
                continueButton.textContent = 'Processing...';

                // Disable the button to prevent multiple clicks
                continueButton.disabled = true;
                continueButton.classList.add('button-disabled');

                // You can also add a CSS class to change the appearance
                continueButton.style.backgroundColor = '#ccc'; // Change to a grey color
                continueButton.style.cursor = 'not-allowed';
            }

            // If you have other submit buttons, disable them too
            submitButtons.forEach(button => {
                button.disabled = true;
            });
            
            // If for some reason the form doesn't submit, reset after a timeout
            // This is a safety mechanism
            setTimeout(function() {
                isSubmitting = false;
            }, 10000); // 10 second timeout
        });
    });
});