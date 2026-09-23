# Formularios que ve el cliente

No son parte de la app: se pegan en el módulo de Make que responde al enlace del WhatsApp. Viven
acá porque **dependen de la app**: el logo que muestran es el archivo que la app publica, así que
cambiar `public/logo-polifroni.png` cambia los dos formularios sin tocarlos.

## El logo

```html
<img src="https://app-polifroni.vercel.app/logo-polifroni.png" alt="Polifroni" ... />
```

Y **no** desde Google Drive. Un enlace de Drive sólo sirve si el archivo está compartido con
"cualquiera con el enlace", y aun así Drive contesta con un redirect que muchos clientes de correo
y navegadores no siguen. Medido contra el enlace que estaba puesto:

```
drive.google.com/thumbnail?id=…  →  HTTP 302 · 0 bytes   (no llega ninguna imagen)
app-polifroni.vercel.app/…png    →  HTTP 200 · image/png · 61.679 bytes
```

Por eso en el formulario se veía el ícono de imagen rota.
