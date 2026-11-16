use super::*;
use std::collections::HashSet;

impl ProjectAssets {
    /// Seed a separate worktree using the files selected for the approved design.
    /// The caller must verify worktree ownership before invoking this operation.
    pub fn stage_selection(
        &self,
        destination: &Self,
        ids: &[String],
    ) -> Result<Vec<Asset>, String> {
        if self.workspace == destination.workspace || ids.len() > 100 {
            return Err("Choose up to 100 project assets for a separate worktree.".into());
        }
        let mut seen = HashSet::new();
        let selected = ids
            .iter()
            .filter(|id| seen.insert(id.as_str()))
            .map(|id| self.asset(id).and_then(delivery_snapshot))
            .collect::<Result<Vec<_>, _>>()?;
        if selected.is_empty() {
            return Ok(Vec::new());
        }
        let parent = ensure_dir(&destination.workspace.join(DIRECTORY))?;
        selected
            .into_iter()
            .map(|asset| {
                let folder = parent.join(&asset.id);
                if checked(&folder, true)?.is_none() {
                    publish_dir(&parent, &folder, |staging| {
                        self.write_snapshot(staging, &asset)
                    })
                    .map_err(|error| {
                        format!(
                            "Could not stage {} for the worktree: {error}",
                            asset.original.filename
                        )
                    })?;
                }
                destination.verify_staged(&asset).map_err(|error| {
                    format!(
                        "Could not use {} in the worktree: {error}",
                        asset.original.filename
                    )
                })
            })
            .collect()
    }

    fn write_snapshot(&self, staging: &Path, asset: &Asset) -> Result<(), String> {
        copy_verified_file(self, staging, &asset.original)?;
        let mut manifest = asset.clone();
        manifest.variants.clear();
        manifest.original.available = true;
        save_json(staging.join("asset.json"), &manifest)?;
        if !asset.variants.is_empty() {
            let variants = ensure_dir(&staging.join("variants"))?;
            for variant in &asset.variants {
                let directory = ensure_dir(&variants.join(&variant.id))?;
                copy_verified_file(self, &directory, &variant.file)?;
                save_json(directory.join("asset.json"), variant)?;
            }
        }
        Ok(())
    }

    fn verify_staged(&self, expected: &Asset) -> Result<Asset, String> {
        let staged = self.asset(&expected.id)?;
        if !same_file(&staged.original, &expected.original) || staged.approval != expected.approval
        {
            return Err(
                "The selected asset or approval differs from the copy already here.".into(),
            );
        }
        self.read_file(&staged.original)?;
        for variant in &expected.variants {
            let here = staged
                .variants
                .iter()
                .find(|here| here.id == variant.id)
                .ok_or("A selected asset version is missing from the existing copy.")?;
            if !same_file(&here.file, &variant.file)
                || here.options != variant.options
                || here.candidate != variant.candidate
            {
                return Err("A selected asset version differs from the copy already here.".into());
            }
            self.read_file(&here.file)?;
        }
        Ok(staged)
    }
}

fn delivery_snapshot(mut asset: Asset) -> Result<Asset, String> {
    let approved = asset
        .approval
        .as_ref()
        .and_then(|approval| approval.variant_id.as_deref());
    let mut lineage = HashSet::new();
    let mut current = approved;
    while let Some(id) = current {
        if !lineage.insert(id.to_owned()) {
            return Err("Project asset version ancestry contains a cycle.".into());
        }
        let parent = asset
            .variants
            .iter()
            .find(|variant| variant.id == id)
            .ok_or("An approved project asset version or its parent is missing.")?;
        current = parent.options.parent_variant.as_deref();
    }
    for purpose in [Purpose::Preview, Purpose::Poster] {
        if let Some(fallback) = asset.variants.iter().find(|variant| {
            variant.options.purpose == purpose
                && variant.options.parent_variant.as_deref() == approved
                && variant.file.available
        }) {
            lineage.insert(fallback.id.clone());
        }
    }
    asset
        .variants
        .retain(|variant| lineage.contains(&variant.id));
    Ok(asset)
}

fn copy_verified_file(
    source: &ProjectAssets,
    destination: &Path,
    record: &AssetFile,
) -> Result<(), String> {
    let name = Path::new(&record.path)
        .file_name()
        .ok_or("Project asset path has no filename.")?;
    save(destination.join(name), &source.read_file(record)?)
}

fn same_file(left: &AssetFile, right: &AssetFile) -> bool {
    left.path == right.path && left.sha256 == right.sha256 && left.size == right.size
}
