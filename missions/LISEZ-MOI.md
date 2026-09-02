# Dossier de travail — jamais versionné

Ce dossier est exclu du dépôt (`.gitignore` + hook `pre-commit`). Il accueille
les données réelles, une mission par sous-dossier :

```
missions/
  acme-usine-nord/
    2026-brut-enedis.csv      le fichier tel que reçu
    2026-normalise.csv        les trois colonnes attendues par le tableau de bord
    notes.md                  hypothèses, contacts, périmètre
```

Les livrables générés vont dans `livrables/`, également hors dépôt.

Rappel : disque chiffré (FileVault), autorisation écrite de traiter les données
dans la lettre de mission, et durée de conservation convenue avec le client.
