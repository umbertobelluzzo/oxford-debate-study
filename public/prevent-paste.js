document.addEventListener('DOMContentLoaded', function() {
  console.log("🔒 PRODUCTION MODE: Copy-paste restrictions are ACTIVE");
  
  // Target textareas in debate forms specifically
  const debateTextareas = document.querySelectorAll('form[action="/debate-turn"] textarea, form[action="/debate-prep"] textarea');
  
  debateTextareas.forEach(function(textarea) {
      // Prevent paste operations
      textarea.addEventListener('paste', function(e) {
          e.preventDefault();
          showPasteWarning();
          return false;
      });
      
      // Prevent context menu (right-click)
      textarea.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          return false;
      });
      
      // Prevent common keyboard shortcuts
      textarea.addEventListener('keydown', function(e) {
          // Prevent Ctrl+V, Ctrl+C, Ctrl+X, Ctrl+A, Ctrl+Z, Ctrl+Y
          if (e.ctrlKey || e.metaKey) {
              if (e.keyCode === 86 || // V (paste)
                  e.keyCode === 67 || // C (copy)
                  e.keyCode === 88 || // X (cut)
                  e.keyCode === 65 || // A (select all)
                  e.keyCode === 90 || // Z (undo)
                  e.keyCode === 89) { // Y (redo)
                  e.preventDefault();
                  showPasteWarning();
                  return false;
              }
          }
      });
      
      // Add visual indicator that restrictions are active
      const form = textarea.closest('form');
      if (form && !form.querySelector('.paste-warning')) {
          const warningBanner = document.createElement('div');
          warningBanner.className = 'paste-warning';
          warningBanner.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Copy-paste is disabled for debate responses to ensure original thinking.
          `;
          
          // Insert the warning before the textarea's parent form group
          const formGroup = textarea.closest('.form-group');
          if (formGroup) {
              formGroup.parentNode.insertBefore(warningBanner, formGroup);
          }
      }
  });
  
  // Function to show paste warning
  function showPasteWarning() {
      // Check if warning already exists
      if (document.querySelector('.paste-blocked-message')) {
          return;
      }
      
      const warning = document.createElement('div');
      warning.className = 'paste-blocked-message';
      warning.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: #f8d7da;
          color: #721c24;
          padding: 15px 20px;
          border-radius: 8px;
          border: 1px solid #f5c6cb;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10000;
          font-weight: bold;
          max-width: 300px;
          animation: slideIn 0.3s ease-out;
      `;
      
      warning.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                  <path d="M12 7V13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <circle cx="12" cy="16" r="1" fill="currentColor"/>
              </svg>
              <span>Copy-paste is disabled during debates</span>
          </div>
      `;
      
      // Add slide-in animation
      const style = document.createElement('style');
      style.textContent = `
          @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
          }
      `;
      document.head.appendChild(style);
      
      document.body.appendChild(warning);
      
      // Remove warning after 3 seconds
      setTimeout(function() {
          if (warning.parentNode) {
              warning.style.animation = 'slideIn 0.3s ease-out reverse';
              setTimeout(function() {
                  if (warning.parentNode) {
                      warning.parentNode.removeChild(warning);
                  }
              }, 300);
          }
      }, 3000);
  }
  
  // Also prevent drag and drop of text
  debateTextareas.forEach(function(textarea) {
      textarea.addEventListener('drop', function(e) {
          e.preventDefault();
          showPasteWarning();
          return false;
      });
      
      textarea.addEventListener('dragover', function(e) {
          e.preventDefault();
          return false;
      });
  });
  
  // Additional security: Clear clipboard on page load for debate pages
  const isDebatePage = window.location.pathname.includes('/debate-turn') || 
                      window.location.pathname.includes('/debate-prep');
  
  if (isDebatePage && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('').catch(function() {
          // Ignore errors if clipboard access is denied
      });
  }
});