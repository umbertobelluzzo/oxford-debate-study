// Add this script to a new file called 'button-disable.js' in your public folder

document.addEventListener('DOMContentLoaded', function () {
    // Find all forms in the document
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
        form.addEventListener('submit', function (event) {
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
        });
    });
});