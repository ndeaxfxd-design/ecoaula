# EcoAula: encuesta visual de 7 preguntas

Esta es una página estática lista para GitHub y Vercel, sin instalar Node ni compilar.

## Uso

El estudiante ve todas las preguntas en una sola página y selecciona botones con iconos. Son **7 preguntas principales** y hay dos opciones condicionales: combustible solo para moto/auto y tamaño de porción solo si consume carne de res. La encuesta toma aprox. 2 minutos.

Los datos registrados son: código seudónimo del alumno, curso, respuestas originales y tres indicadores aproximados: kilómetros semanales de ida y vuelta, consumo eléctrico mensual del hogar dividido por número de personas, y kilogramos aproximados de carne de res semanal.

**No calcular como huella de carbono total ni expresar los tres indicadores en kg CO₂e.** Para eso hay que aplicar factores de emisión específicos documentados y ampliar el inventario de actividades. Los rangos son imprecisos; se usan puntos medios elegidos con fines educativos. «Más de 20 km» se aproxima como 25 km, «más de 300 kWh» como 350 kWh y «6 o más personas» como 6.

## Demostración rápida

Abre `index.html` desde el archivo ZIP descomprimido en un navegador. El modo demostración almacena respuestas **únicamente en el navegador y equipo utilizados**, no reúne celulares distintos. En el panel se puede filtrar por curso y presionar **Exportar a Excel (CSV)**; el CSV usa UTF-8 con BOM y separador de punto y coma, que abre en Excel en español.

## Para que todas las respuestas de los alumnos lleguen a un mismo lugar

1. Crea un proyecto en <https://supabase.com>.
2. En **SQL Editor**, ejecuta `schema.sql`. Si existían tablas antiguas, esta versión crea la nueva tabla `encuestas_v2` y conserva las anteriores.
3. En **Authentication > Providers**, habilita **Anonymous Sign-ins** y **Email**.
4. Abre `config.js` y coloca la URL del proyecto y su clave **publishable** pública. **Jamás uses la clave secreta (`service_role`/`secret`) en un archivo del sitio.**
5. Sube la carpeta del sitio a GitHub y conéctala a Vercel. En Vercel se despliega como **Other / Static**, sin comando build.
6. En Supabase > **Authentication > URL Configuration**, configura como **Site URL** y **Redirect URLs** la URL que te dio Vercel, para que funcione el enlace de correo del docente.
7. Abre la página desplegada, ingresa al **Panel docente**, introduce tu correo y abre el enlace recibido. A continuación, en SQL Editor ejecuta (reemplazando el correo):

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email='TU_CORREO_REAL'
   on conflict do nothing;
   ```
8. Recarga el panel. Ahora puedes consultar el conjunto de alumnos de cualquier celular y exportar a Excel (CSV).

**Acceso:** la política RLS permite que los alumnos solo inserten una respuesta asociada a su sesión anónima; impide que lean las respuestas de los demás. El panel exige usuario docente no anónimo incluido en `admin_users`. No hay acceso administrativo desde un código incluido en el navegador.

**Limitaciones operativas:** al ser una encuesta sin contraseñas de estudiantes, los códigos se pueden suplantar. Entrega códigos individuales, supervisa el proceso, limita difusión del enlace y habilita CAPTCHA para controlar abuso en una aplicación pública. Una sesión anónima solo envía una respuesta, y el mismo código no se puede repetir en un curso. Por privacidad, no se piden nombres ni correos a los alumnos.

## Método estadístico

- `km_traslado_semanal = distancia_ida_aproximada × 2 × días_semana_aproximados`.
- `kWh_persona_mes = kWh_hogar_mes_aproximados ÷ personas_hogar`; si marca «No sé», el dato queda faltante y se excluye de promedios.
- `kg_carne_res_semana = ocasiones_semana_aproximadas × gramos_porción_aproximados / 1000`; si no consume, vale 0.
- Las medidas grupales incluyen **media, mediana, desviación estándar poblacional y frecuencias**. Se exporta la respuesta textual original, para análisis descriptivo en Excel.

Fuentes para orientar futuras conversiones a CO₂e: [GHG Protocol, método de distancia para transporte](https://ghgprotocol.org/sites/default/files/standards/Scope3_Calculation_Guidance_0.pdf); [Our World in Data, emisiones asociadas a alimentos](https://ourworldindata.org/grapher/ghg-per-kg-poore); [Supabase, autenticación anónima](https://supabase.com/docs/guides/auth/auth-anonymous).
