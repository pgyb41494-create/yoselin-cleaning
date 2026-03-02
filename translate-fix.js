const fs = require('fs');

// BookingWizard translations
let bw = fs.readFileSync('./components/BookingWizard.js', 'utf8');

const bwR = [
  ['Request a Free Walk-Through\n', "{t('Request a Free Walk-Through','Solicitar Visita Gratuita')}\n"],
  ['Walk-through requested', "{t('Walk-through requested','Visita solicitada')}"],
  ['>Next: Rooms</button>', ">{t('Next: Rooms','Siguiente: Habitaciones')}</button>"],
  ['class="page-title">Rooms</div>', 'class="page-title">{t(\'Rooms\',\'Habitaciones\')}</div>'],
  ['>Select at least one room or bathroom to continue</div>', ">{t('Select at least one room or bathroom to continue','Selecciona al menos una habitación o baño')}</div>"],
  ['>Bedrooms and Living</div>', ">{t('Bedrooms and Living','Dormitorios y Sala')}</div>"],
  ['card-title">Bathrooms</div>', "card-title\">{t('Bathrooms','Baños')}</div>"],
  ['>Kitchen and Utility</div>', ">{t('Kitchen and Utility','Cocina y Utilidad')}</div>"],
  ['>Back</button>', ">{t('Back','Atrás')}</button>"],
  ['>Next: Add-Ons</button>', ">{t('Next: Add-Ons','Siguiente: Extras')}</button>"],
  ['>Next: Review</button>', ">{t('Next: Review','Siguiente: Revisión')}</button>"],
  ['class="page-title">Preferences</div>', "class=\"page-title\">{t('Preferences','Preferencias')}</div>"],
  ['>Extras, frequency, and a few quick questions</div>', ">{t('Extras, frequency, and a few quick questions','Extras, frecuencia y algunas preguntas rápidas')}</div>"],
  ['>How often?</div>', ">{t('How often?','¿Con qué frecuencia?')}</div>"],
  ['>Add-On Services</div>', ">{t('Add-On Services','Servicios Adicionales')}</div>"],
  ['>All optional</div>', ">{t('All optional','Todos opcionales')}</div>"],
  ['>How many windows?</span>', ">{t('How many windows?','¿Cuántas ventanas?')}</span>"],
  ['>Any Pets?</label>', ">{t('Any Pets?','¿Mascotas?')}</label>"],
  ['>Other Requests ', ">{t('Other Requests','Otras Solicitudes')} "],
  ['>Review and Submit</div>', ">{t('Review and Submit','Revisar y Enviar')}</div>"],
  ['>Add any notes and submit your request</div>', ">{t('Add any notes and submit your request','Agrega notas y envía tu solicitud')}</div>"],
  ['>Special Requests</div>', ">{t('Special Requests','Solicitudes Especiales')}</div>"],
  ['>Notes <', ">{t('Notes','Notas')} <"],
  ['>How did you hear about us?</label>', ">{t('How did you hear about us?','¿Cómo supiste de nosotros?')}</label>"],
  ['>Home Access</label>', ">{t('Home Access','Acceso al Hogar')}</label>"],
  ['card-title">Discounts</div>', "card-title\">{t('Discounts','Descuentos')}</div>"],
  ['>Any applicable discounts will be applied to your estimate</div>', ">{t('Any applicable discounts will be applied to your estimate','Los descuentos aplicables se agregarán a tu estimado')}</div>"],
  ['>First-time client?</label>', ">{t('First-time client?','¿Primera vez?')}</label>"],
  ['>Senior discount?</label>', ">{t('Senior discount?','¿Descuento para mayores?')}</label>"],
];

let count = 0;
bwR.forEach(([from, to]) => {
  while (bw.includes(from)) {
    bw = bw.replace(from, to);
    count++;
  }
});

// Handle special cases with regex for BookingWizard
bw = bw.replace(/'Discount applied!'/g, "t('Discount applied!','¡Descuento aplicado!')");
bw = bw.replace(/'YOUR ESTIMATE'/g, "t('YOUR ESTIMATE','TU ESTIMADO')");
bw = bw.replace(/'Select rooms to calculate'/g, "t('Select rooms to calculate','Selecciona habitaciones')");
bw = bw.replace(/'Final price confirmed after walkthrough or consultation\.'/g, "t('Final price confirmed after walkthrough or consultation.','Precio final confirmado después de visita o consulta.')");
bw = bw.replace(/\{submitting \? 'Submitting\.\.\.' : 'Submit Request/, "{submitting ? t('Submitting...','Enviando...') : t('Submit Request");
// Fix the closing part of the submit button
bw = bw.replace("t('Submit Request  \\u2014  $' + price.final}", "t('Submit Request','Enviar Solicitud') + '  \\u2014  $' + price.final}");

fs.writeFileSync('./components/BookingWizard.js', bw);
console.log('BookingWizard: ' + count + ' replacements done');
