from oposiciones.fechas import fecha_de_examen


def test_encuentra_la_fecha_del_primer_ejercicio():
    texto = (
        "Se anuncia que el primer ejercicio de la fase de oposición se celebrará el día 14 de marzo de 2027, "
        "a las 10:00 horas, en los lugares indicados en el anexo."
    )
    assert fecha_de_examen(texto) == "2027-03-14"


def test_acepta_otras_formulaciones():
    assert fecha_de_examen("El ejercicio tendrá lugar el 2 de octubre de 2026 en Madrid.") == "2026-10-02"
    assert fecha_de_examen("La realización del primer ejercicio comenzará el día 1 de febrero de 2027.") == "2027-02-01"


def test_ignora_fechas_que_no_son_de_examen():
    texto = "Resolución de 9 de noviembre de 2026. Plazo de reclamaciones de diez días hábiles."
    assert fecha_de_examen(texto) is None


def test_sin_texto_no_hay_fecha():
    assert fecha_de_examen("") is None
