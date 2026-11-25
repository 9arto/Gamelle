    // Thème : « system » (suit l'iPhone), « light » ou « dark ». Réglable dans Réglages > Apparence.
    (function () {
      var KEY = 'gamelle_theme';
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      function getPref() {
        try {
          var v = localStorage.getItem(KEY);
          if (v === 'light' || v === 'dark') return v;
        } catch (e) {}
        return 'system';
      }
      function apply() {
        var pref = getPref();
        var dark = pref === 'dark' || (pref === 'system' && mq.matches);
        document.documentElement.classList.toggle('dark', dark);
        var tc = document.querySelector('meta[name="theme-color"]');
        if (tc) tc.setAttribute('content', dark ? '#1c1c1e' : '#059669');
        var bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (bar) bar.setAttribute('content', dark ? 'black' : 'default');
      }
      window.gamelleTheme = {
        get: getPref,
        set: function (pref) {
          try {
            if (pref === 'system') localStorage.removeItem(KEY);
            else localStorage.setItem(KEY, pref);
          } catch (e) {}
          apply();
        }
      };
      apply();
      if (mq.addEventListener) mq.addEventListener('change', apply);
      else if (mq.addListener) mq.addListener(apply);
    })();
