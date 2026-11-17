from oposiciones.plazos import extraer_plazo, extraer_tasa, fin_de_plazo

TEXTO = (
    "El plazo de presentación de solicitudes será de veinte días hábiles, contados a partir del día siguiente "
    "al de la publicación de esta convocatoria en el «Boletín Oficial del Estado». La tasa por derechos de examen "
    "será de 12,38 euros; los miembros de familia numerosa tendrán una reducción."
)


def test_lee_el_plazo_en_letra_y_en_numero():
    assert extraer_plazo(TEXTO) == (20, "hábiles")
    assert extraer_plazo("El plazo para presentar instancias es de 15 días naturales desde el siguiente.") == (15, "naturales")
    assert extraer_plazo("el plazo de presentación será de diez (10) días hábiles") == (10, "hábiles")


def test_lee_un_mes_como_plazo():
    assert extraer_plazo("El plazo de presentación de solicitudes será de un mes desde la publicación.") == (1, "mes")


def test_sin_plazo_devuelve_none():
    assert extraer_plazo("Se aprueba la lista de admitidos.") is None


def test_lee_la_tasa_en_euros():
    assert extraer_tasa(TEXTO) == 12.38
    assert extraer_tasa("Los derechos de examen son de 1.234,50 euros.") == 1234.5
    assert extraer_tasa("Sin tasa alguna.") is None


def test_dias_habiles_excluyen_sabados_y_domingos_y_empiezan_al_dia_siguiente():
    # publicada el lunes 16-11-2026: el día 1 es el martes 17; el día 20 es el lunes 14-12
    assert fin_de_plazo("2026-11-16", 20, "hábiles") == "2026-12-14"


def test_dias_naturales_y_meses():
    assert fin_de_plazo("2026-11-16", 15, "naturales") == "2026-12-01"
    assert fin_de_plazo("2026-01-31", 1, "mes") == "2026-02-28"
