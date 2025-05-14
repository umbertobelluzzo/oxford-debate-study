// Enhanced version of public/prevent-paste.js
document.addEventListener('DOMContentLoaded', function() {
  // Target all textareas in debate forms
  const debateTextareas = document.querySelectorAll('form[action="/debate-turn"] textarea');
  
  debateTextareas.forEach(textarea => {
    // Prevent paste
    textarea.addEventListener('paste', function(event) {
      event.preventDefault();
      alert('Pasting is not allowed in debate responses. Please type your own arguments.');
    });
    
    // Prevent drag and drop (which can be used to bypass paste restrictions)
    textarea.addEventListener('drop', function(event) {
      event.preventDefault();
      alert('Dropping text is not allowed in debate responses. Please type your own arguments.');
    });
    
    // Prevent context menu to make it harder to circumvent
    textarea.addEventListener('contextmenu', function(event) {
      event.preventDefault();
      return false;
    });
  });
  
  // Add warning message to debate textarea containers
  const textareaContainers = document.querySelectorAll('.form-group:has(textarea[name="argument"])');
  textareaContainers.forEach(container => {
    const warningElement = document.createElement('div');
    warningElement.className = 'paste-warning';
    warningElement.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> Copy-paste is disabled to ensure original responses.';
    
    // Insert the warning before the textarea
    const textarea = container.querySelector('textarea');
    container.insertBefore(warningElement, textarea);
  });
});