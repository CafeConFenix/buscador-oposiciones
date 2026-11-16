from oposiciones.temarios import comprobar_enlaces, extraer_temas

ANEXO = """ANEXO II
Programa
Parte I. Organización del Estado
Tema 1. La Constitución española de 1978: estructura y contenido.
Los derechos y deberes fundamentales.
Tema 2. La Corona. Las Cortes Generales.
Tema 10. El Gobierno y la Administración.
Parte II
TEMA 11 – Procedimiento administrativo común.
Tema 1. Repetido por otro grupo de materias."""


def test_extrae_los_temas_numerados_con_su_titulo():
    temas = extraer_temas(ANEXO)
    assert temas[0] == {"numero": 1, "titulo": "La Constitución española de 1978: estructura y contenido."}
    assert [t["numero"] for t in temas] == [1, 2, 10, 11]


def test_acepta_mayusculas_y_guion_y_descarta_numeros_repetidos():
    temas = extraer_temas(ANEXO)
    assert temas[-1]["titulo"] == "Procedimiento administrativo común."


def test_sin_temas_devuelve_lista_vacia():
    assert extraer_temas("Texto sin programa.") == []


def test_comprobar_enlaces_marca_los_que_fallan():
    respuestas = {"https://a.es": 200, "https://b.es": 404}

    def sonda(url):
        if url == "https://c.es":
            raise OSError("sin red")
        return respuestas[url]

    estado = comprobar_enlaces(["https://a.es", "https://b.es", "https://c.es"], sonda)
    assert estado == {"https://a.es": True, "https://b.es": False, "https://c.es": False}


def test_actualizar_temarios_guarda_los_temas_de_la_convocatoria_que_coincide(tmp_path):
    from oposiciones.actualizar import actualizar_temarios

    class Falso:
        def parrafos_xml(self, url):
            return "Anexo\nTema 1. Constitución.\nTema 2. Corona."

    oposiciones = [
        {"id": "aux", "boe": ["Cuerpo General Auxiliar"]},
        {"id": "otra", "boe": ["Cuerpo de Gestión"]},
    ]
    convocatorias = [
        {"id": "X", "tipo": "convocatoria", "titulo": "Se convocan pruebas del Cuerpo General Auxiliar", "url_xml": "u"},
        {"id": "Y", "tipo": "admitidos", "titulo": "Cuerpo General Auxiliar admitidos", "url_xml": "u"},
    ]
    n = actualizar_temarios(Falso(), oposiciones, convocatorias, tmp_path)
    assert n == 1
    import json
    datos = json.loads((tmp_path / "aux.json").read_text("utf-8"))
    assert [t["numero"] for t in datos["temas"]] == [1, 2]
    assert datos["fuente"] == "X"
    assert not (tmp_path / "otra.json").exists()
