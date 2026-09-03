/* Replace each public page's legacy footer with the canonical shared footer. */
(function () {
  "use strict";

  var footers = document.querySelectorAll("footer");
  if (!footers.length) return;

  fetch("data/public-footer.html?v=2", { credentials: "same-origin" })
    .then(function (response) {
      if (!response.ok) throw new Error("Could not load the shared public footer.");
      return response.text();
    })
    .then(function (markup) {
      var parsed = new DOMParser().parseFromString(markup, "text/html");
      var sharedFooter = parsed.querySelector("footer.index-footer");
      if (!sharedFooter) throw new Error("Shared public footer markup is missing.");

      footers.forEach(function (footer) {
        footer.replaceWith(sharedFooter.cloneNode(true));
      });
    })
    .catch(function (error) {
      console.error(error);
    });
}());