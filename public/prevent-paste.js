document.addEventListener('DOMContentLoaded', function() {
    console.log("⚠️ TESTING MODE: Copy-paste restrictions are DISABLED");
    
    // Add a visual indicator that testing mode is active
    const form = document.querySelector('form[action="/debate-turn"]');
    if (form) {
      const testingBanner = document.createElement('div');
      testingBanner.style.backgroundColor = '#fff3cd';
      testingBanner.style.color = '#856404';
      testingBanner.style.padding = '5px 10px';
      testingBanner.style.marginBottom = '10px';
      testingBanner.style.borderRadius = '4px';
      testingBanner.style.fontWeight = 'bold';
      testingBanner.innerHTML = '⚠️ TESTING MODE: Copy-paste is allowed';
      form.prepend(testingBanner);
    }
  });