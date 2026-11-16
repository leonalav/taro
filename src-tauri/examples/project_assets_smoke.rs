use std::{
    env, fs,
    io::{self, Write},
    path::Path,
};
use taro::project_assets::{
    AssetApproval, AssetOptions, ProjectAssets, Purpose, Source, VariantOptions,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args().skip(1).collect();
    let store = ProjectAssets::open(Path::new(&args[0]))?;
    match args[1].as_str() {
        "list" => println!("{}", serde_json::to_string(&store.list()?)?),
        "import" => {
            let path = Path::new(&args[2]);
            let asset = store.import(
                path.file_name().unwrap().to_str().unwrap(),
                &fs::read(path)?,
                Source::default(),
                AssetOptions::default(),
            )?;
            println!("{}", serde_json::to_string(&asset)?);
        }
        "attach" => {
            let path = Path::new(&args[3]);
            store.add_variant(
                &args[2],
                path.file_name().unwrap().to_str().unwrap(),
                &fs::read(path)?,
                VariantOptions {
                    purpose: Purpose::Preview,
                    request: "Product still".into(),
                    ..Default::default()
                },
            )?;
        }
        "delivery" => {
            let path = Path::new(&args[3]);
            let options: VariantOptions = serde_json::from_str(&args[4])?;
            let variant = store.add_variant(
                &args[2],
                path.file_name().unwrap().to_str().unwrap(),
                &fs::read(path)?,
                options,
            )?;
            println!("{}", serde_json::to_string(&variant)?);
        }
        "compact" => {
            let variant = store.compact_glb(&args[2], args.get(3).map(String::as_str))?;
            println!("{}", serde_json::to_string(&variant)?);
        }
        "subset" => {
            let variant = store.subset_font(&args[2], args.get(4).map(String::as_str), &args[3])?;
            println!("{}", serde_json::to_string(&variant)?);
        }
        "approve" => {
            let approval: Option<AssetApproval> = serde_json::from_str(&args[4])?;
            let asset = store.set_approval(&args[2], args[3].parse()?, approval)?;
            println!("{}", serde_json::to_string(&asset)?);
        }
        "bytes" => {
            io::stdout().write_all(&store.read(&args[2], args.get(3).map(String::as_str))?)?
        }
        _ => return Err("Unknown asset smoke action".into()),
    }
    Ok(())
}
