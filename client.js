(function () {
  "use strict";
  // Submit-on-enter search; let server handle the rest (SSR keeps SEO simple).
  var search = document.querySelector(".search");
  if (search) {
    var input = search.querySelector(".search__input");
    var btn = search.querySelector(".search__btn");
    if (input && btn) {
      // Visual cue while typing
      input.addEventListener("input", function () {
        btn.classList.toggle("search__btn--active", input.value.length > 0);
      });
    }
  }

  // Smooth scroll for hash links
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1);
      var target = id && document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", "#" + id);
      }
    });
  });
})();
