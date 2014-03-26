from newhive.snapshot import start_snapshots

from newhive.runner import ImageScalerRunner
def run_resampler():
    image_resampler = ImageScalerRunner(
        print_frequency=50,thread_limit=20,continuous=True)
    image_resampler.run()

# def run_snapshotter():
    # snapshotter = SnapshotRunner(
    #     print_frequency=50,thread_limit=20,continuous=True)
    # snapshotter.run()
